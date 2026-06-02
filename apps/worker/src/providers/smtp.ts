import type { EmailPayload, SendResult, SmtpCredentials } from '../types';
import type { EmailProvider } from './interface';

// cloudflare:sockets – available in both wrangler dev and production Workers
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – module exists at runtime; types bundled in newer workers-types
import { connect } from 'cloudflare:sockets';

interface SmtpResponse {
  code: number;
  message: string;
}

interface CfSocket {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  startTls(): CfSocket;
  close(): Promise<void>;
}

class SmtpConnection {
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = '';

  constructor(private socket: CfSocket) {
    this.writer = socket.writable.getWriter();
    this.reader = socket.readable.getReader();
  }

  upgrade(newSocket: CfSocket): void {
    try { this.writer.releaseLock(); } catch { /* already released */ }
    try { this.reader.releaseLock(); } catch { /* already released */ }
    this.socket = newSocket;
    this.writer = newSocket.writable.getWriter();
    this.reader = newSocket.readable.getReader();
  }

  private async readLine(): Promise<string> {
    while (true) {
      const nl = this.buffer.indexOf('\n');
      if (nl >= 0) {
        const line = this.buffer.slice(0, nl + 1).replace(/\r?\n$/, '');
        this.buffer = this.buffer.slice(nl + 1);
        return line;
      }
      const { done, value } = await this.reader.read();
      if (done) throw new Error('SMTP connection closed unexpectedly');
      this.buffer += new TextDecoder().decode(value);
    }
  }

  async readResponse(): Promise<SmtpResponse> {
    let code = 0;
    let message = '';
    while (true) {
      const line = await this.readLine();
      code = parseInt(line.slice(0, 3), 10);
      const sep = line[3]; // ' ' = last line, '-' = continued
      const text = line.slice(4);
      message += (message ? '\n' : '') + text;
      if (sep === ' ') return { code, message };
    }
  }

  async command(cmd: string): Promise<SmtpResponse> {
    await this.writer.write(new TextEncoder().encode(cmd + '\r\n'));
    return this.readResponse();
  }

  async sendRaw(data: string): Promise<void> {
    await this.writer.write(new TextEncoder().encode(data));
  }

  async close(): Promise<void> {
    try { await this.command('QUIT'); } catch { /* ignore */ }
    try { this.writer.releaseLock(); } catch { /* ignore */ }
    try { this.reader.releaseLock(); } catch { /* ignore */ }
    try { await this.socket.close(); } catch { /* ignore */ }
  }
}

function b64encode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function dotStuff(text: string): string {
  return text.split('\n').map(l => (l.startsWith('.') ? '.' + l : l)).join('\n');
}

function buildMessage(payload: EmailPayload): string {
  const from = payload.from_name
    ? `${payload.from_name} <${payload.from_email}>`
    : payload.from_email;
  const date = new Date().toUTCString();
  const base = [
    `From: ${from}`,
    `To: ${payload.to_email}`,
    `Subject: ${payload.subject}`,
    `Date: ${date}`,
    'MIME-Version: 1.0',
    ...(payload.reply_to ? [`Reply-To: ${payload.reply_to}`] : []),
  ];

  if (payload.html) {
    const boundary = `----=_Part_${Date.now()}`;
    const headers = [
      ...base,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join('\r\n');

    const plainPart = [
      `--${boundary}`,
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(payload.plain_text),
    ].join('\r\n');

    const htmlPart = [
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      dotStuff(payload.html),
      `--${boundary}--`,
    ].join('\r\n');

    return `${headers}\r\n\r\n${plainPart}\r\n\r\n${htmlPart}`;
  }

  const headers = [
    ...base,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ].join('\r\n');

  return `${headers}\r\n\r\n${dotStuff(payload.plain_text)}`;
}

export class SmtpProvider implements EmailProvider {
  constructor(private readonly creds: SmtpCredentials) {}

  getProviderName(): string {
    return 'smtp';
  }

  async validateCredentials(): Promise<boolean> {
    try {
      await this.openAuthenticatedConnection();
      return true;
    } catch {
      return false;
    }
  }

  private async openAuthenticatedConnection(): Promise<{ conn: SmtpConnection; socket: CfSocket }> {
    const { host, port, username, password, encryption } = this.creds;

    const secureTransport = encryption === 'ssl' ? 'on' : 'starttls';
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const socket = (connect as any)({ hostname: host, port }, { secureTransport, allowHalfOpen: false }) as CfSocket;
    const conn = new SmtpConnection(socket);

    const greeting = await conn.readResponse();
    if (greeting.code !== 220) throw new Error(`SMTP greeting failed (${greeting.code}): ${greeting.message}`);

    let ehloResp = await conn.command(`EHLO ${host}`);
    if (ehloResp.code !== 250) throw new Error(`EHLO failed: ${ehloResp.message}`);

    if (encryption === 'tls') {
      const stls = await conn.command('STARTTLS');
      if (stls.code !== 220) throw new Error(`STARTTLS failed: ${stls.message}`);
      const tlsSocket = socket.startTls();
      conn.upgrade(tlsSocket);
      ehloResp = await conn.command(`EHLO ${host}`);
      if (ehloResp.code !== 250) throw new Error(`EHLO after STARTTLS failed: ${ehloResp.message}`);
    }

    // AUTH LOGIN
    const authInit = await conn.command('AUTH LOGIN');
    if (authInit.code === 334) {
      const userResp = await conn.command(b64encode(username));
      if (userResp.code !== 334) throw new Error('SMTP username rejected');
      const passResp = await conn.command(b64encode(password));
      if (passResp.code !== 235) throw new Error(`SMTP authentication failed: ${passResp.message}`);
    } else {
      // Fallback: AUTH PLAIN
      const plainCreds = b64encode(`\0${username}\0${password}`);
      const plainResp = await conn.command(`AUTH PLAIN ${plainCreds}`);
      if (plainResp.code !== 235) throw new Error(`SMTP auth failed: ${plainResp.message}`);
    }

    return { conn, socket };
  }

  async sendEmail(payload: EmailPayload): Promise<SendResult> {
    const { conn } = await this.openAuthenticatedConnection();

    try {
      const mailFrom = await conn.command(`MAIL FROM:<${payload.from_email}>`);
      if (mailFrom.code !== 250) throw new Error(`MAIL FROM rejected: ${mailFrom.message}`);

      const rcptTo = await conn.command(`RCPT TO:<${payload.to_email}>`);
      if (rcptTo.code !== 250) throw new Error(`RCPT TO rejected: ${rcptTo.message}`);

      const dataInit = await conn.command('DATA');
      if (dataInit.code !== 354) throw new Error(`DATA failed: ${dataInit.message}`);

      const message = buildMessage(payload);
      await conn.sendRaw(message + '\r\n.\r\n');

      const endResp = await conn.readResponse();
      if (endResp.code !== 250) throw new Error(`Message rejected: ${endResp.message}`);

      return { success: true, response: { code: endResp.code, message: endResp.message } };
    } finally {
      await conn.close();
    }
  }
}
