// Email HTML processing – sanitize, variable substitution, unsubscribe, link tracking

const BLOCK_TAGS = ['script', 'iframe', 'form', 'object', 'embed'] as const;
const SKIP_PROTOCOLS = ['mailto:', 'tel:', 'whatsapp:', '#'] as const;

// ─── Sanitize ────────────────────────────────────────────────────────────────

export function sanitizeEmailHtml(html: string): string {
  let result = html;

  for (const tag of BLOCK_TAGS) {
    // Remove paired tags with content
    result = result.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
    // Remove self-closing / orphan opening tags
    result = result.replace(new RegExp(`<${tag}\\b[^>]*/?>`, 'gi'), '');
  }

  // Remove event handler attributes (onclick, onload, onerror, onmouseover, etc.)
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  return result;
}

// ─── Variables ───────────────────────────────────────────────────────────────

export function replaceVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

// ─── Unsubscribe footer ──────────────────────────────────────────────────────

const UNSUBSCRIBE_FOOTER = (url: string) => `
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="margin-top:32px;">
  <tr>
    <td align="center" style="padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#6c6a64;line-height:1.5;">
      Você recebeu este e-mail por estar em nossa lista de contatos.<br>
      <a href="${url}" style="color:#cc785c;text-decoration:underline;">Cancelar inscrição</a>
    </td>
  </tr>
</table>`;

export function ensureUnsubscribeFooter(html: string, unsubscribeUrl: string): string {
  // After variable replacement, {{unsubscribe_url}} is gone; check if actual url is present
  if (html.includes(unsubscribeUrl)) return html;

  const footer = UNSUBSCRIBE_FOOTER(unsubscribeUrl);
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) {
    return html.slice(0, closeBody) + footer + html.slice(closeBody);
  }
  return html + footer;
}

// ─── Link extraction ─────────────────────────────────────────────────────────

export function extractTrackableUrls(html: string): string[] {
  const urls = new Set<string>();
  const re = /href=(?:"([^"]+)"|'([^']+)')/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const url = (m[1] ?? m[2] ?? '').trim();
    if (!url) continue;
    if (url.includes('{{unsubscribe_url}}')) continue;
    if (SKIP_PROTOCOLS.some(p => url.startsWith(p))) continue;
    urls.add(url);
  }

  return [...urls];
}

// ─── Link rewriting ──────────────────────────────────────────────────────────

export function rewriteLinksForTracking(
  html: string,
  getTrackingUrl: (original: string) => string | null,
): string {
  return html.replace(
    /(href=)(?:"([^"]+)"|'([^']+)')/gi,
    (_, prefix: string, dq: string, sq: string) => {
      const url = (dq ?? sq ?? '').trim();
      if (!url) return _;
      if (url.includes('{{unsubscribe_url}}')) return _;
      if (SKIP_PROTOCOLS.some(p => url.startsWith(p))) return _;

      const trackingUrl = getTrackingUrl(url);
      if (!trackingUrl) return _;
      return `${prefix}"${trackingUrl}"`;
    },
  );
}

// ─── Plain text ──────────────────────────────────────────────────────────────

export function generatePlainTextFromHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Full processor ──────────────────────────────────────────────────────────

export interface ProcessHtmlInput {
  html: string;
  vars: Record<string, string>;
  unsubscribeUrl: string;
  /** Map of originalUrl → tracking URL; if absent, link is not rewritten */
  urlToTracking: Map<string, string>;
  /** If set, a tracking pixel is inserted once before </body> */
  trackingPixelUrl?: string;
}

export function insertTrackingPixel(html: string, pixelUrl: string): string {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" border="0" alt="" style="display:none;width:1px;height:1px;" />`;
  const closeBody = html.lastIndexOf('</body>');
  if (closeBody >= 0) return html.slice(0, closeBody) + pixel + html.slice(closeBody);
  return html + pixel;
}

export function processHtml(input: ProcessHtmlInput): { html: string; plainText: string } {
  const hasUnsubPlaceholder = input.html.includes('{{unsubscribe_url}}');

  let html = sanitizeEmailHtml(input.html);
  html = replaceVariables(html, input.vars);

  if (!hasUnsubPlaceholder) {
    html = ensureUnsubscribeFooter(html, input.unsubscribeUrl);
  }

  if (input.urlToTracking.size > 0) {
    html = rewriteLinksForTracking(html, url => input.urlToTracking.get(url) ?? null);
  }

  if (input.trackingPixelUrl) {
    html = insertTrackingPixel(html, input.trackingPixelUrl);
  }

  return { html, plainText: generatePlainTextFromHtml(html) };
}

// ─── Fake vars for preview/test ───────────────────────────────────────────────

export function fakeVars(clientName: string): Record<string, string> {
  return {
    first_name: 'Ana',
    last_name: 'Silva',
    email: 'ana.silva@example.com',
    client_name: clientName,
    unsubscribe_url: 'https://app.exemplo.com/unsubscribe/preview-token',
    current_date: new Date().toLocaleDateString('pt-BR'),
  };
}
