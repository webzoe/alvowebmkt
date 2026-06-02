import type { EmailPayload, SendResult } from '../types';
import type { EmailProvider } from './interface';

const MAILEROO_ENDPOINT = 'https://smtp.maileroo.com/send';

export type MailerooBodyMode = 'json' | 'formdata' | 'urlencoded';
export const DEFAULT_BODY_MODE: MailerooBodyMode = 'formdata';

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v) fd.append(k, v);
  }
  return fd;
}

function buildUrlEncoded(fields: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) {
    if (v) params.set(k, v);
  }
  return params;
}

function buildFlatFields(payload: EmailPayload): Record<string, string> {
  const fields: Record<string, string> = {
    from: payload.from_email,
    to: payload.to_email,
    subject: payload.subject,
  };
  if (payload.from_name) fields.from_name = payload.from_name;
  if (payload.html)      fields.html      = payload.html;
  if (payload.plain_text) fields.plain    = payload.plain_text;
  if (payload.reply_to)  fields.reply_to  = payload.reply_to;
  return fields;
}

async function sendRequest(
  apiKey: string,
  payload: EmailPayload,
  mode: MailerooBodyMode,
): Promise<Response> {
  const flat = buildFlatFields(payload);

  console.log('[maileroo] final payload diagnostic', {
    body_mode: mode,
    subject_present: Boolean(flat.subject),
    subject_length: flat.subject?.length ?? 0,
    from_email: flat.from,
    to_email: flat.to,
    has_html: Boolean(flat.html),
    has_plain: Boolean(flat.plain),
  });

  if (mode === 'formdata') {
    // No Content-Type header — fetch sets it with boundary automatically
    return fetch(MAILEROO_ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: buildFormData(flat),
    });
  }

  if (mode === 'urlencoded') {
    return fetch(MAILEROO_ENDPOINT, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: buildUrlEncoded(flat),
    });
  }

  // json
  const jsonPayload = {
    from:    { address: payload.from_email, display_name: payload.from_name },
    to:      [{ address: payload.to_email,  display_name: payload.to_name || payload.to_email }],
    subject: payload.subject,
    ...(payload.html       ? { html:  payload.html }       : {}),
    ...(payload.plain_text ? { plain: payload.plain_text } : {}),
    ...(payload.reply_to   ? { reply_to_address: payload.reply_to } : {}),
  };
  return fetch(MAILEROO_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(jsonPayload),
  });
}

export class MailerooProvider implements EmailProvider {
  private readonly mode: MailerooBodyMode;

  constructor(private readonly apiKey: string, mode?: MailerooBodyMode) {
    this.mode = mode ?? DEFAULT_BODY_MODE;
  }

  getProviderName(): string {
    return 'maileroo_api';
  }

  async validateCredentials(): Promise<boolean> {
    try {
      const fd = new FormData();
      fd.append('from', 'test@test.com');
      fd.append('to', 'test@test.com');
      fd.append('subject', 'validate');
      fd.append('plain', 'validate');
      const res = await fetch(MAILEROO_ENDPOINT, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey },
        body: fd,
      });
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  }

  async sendEmail(payload: EmailPayload): Promise<SendResult> {
    if (!payload.subject?.trim()) {
      throw new Error('Missing subject before provider request');
    }
    if (!payload.html?.trim() && !payload.plain_text?.trim()) {
      throw new Error('Missing email content before provider request');
    }

    console.log('[maileroo] sending', {
      to: payload.to_email,
      subject_present: Boolean(payload.subject),
      subject_length: payload.subject?.length ?? 0,
      from_email: payload.from_email,
      mode: this.mode,
    });

    const res = await sendRequest(this.apiKey, payload, this.mode);
    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const flat = buildFlatFields(payload);
      const diag = {
        status: res.status,
        body_mode: this.mode,
        subject_present: Boolean(flat.subject),
        subject_type: typeof flat.subject,
        subject_length: flat.subject?.length ?? 0,
        from_email: flat.from,
        to_email: flat.to,
        has_html: Boolean(flat.html),
        has_plain: Boolean(flat.plain),
        payload_keys: Object.keys(flat),
      };
      throw new Error(
        `Maileroo error ${res.status}: ${(data.message as string) ?? JSON.stringify(data)} | diag: ${JSON.stringify(diag)}`,
      );
    }

    return { success: true, response: data };
  }
}
