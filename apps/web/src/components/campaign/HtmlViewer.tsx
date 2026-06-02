import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Monitor, Smartphone, Tablet, RefreshCw, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/Button';
import { Textarea } from '../ui/Textarea';
import { Badge } from '../ui/Badge';

// ─── Local HTML processing (mirrors worker logic for preview) ─────────────────

const FAKE_VARS: Record<string, string> = {
  '{{first_name}}': 'Ana',
  '{{last_name}}': 'Silva',
  '{{email}}': 'ana.silva@example.com',
  '{{client_name}}': 'Cliente Exemplo',
  '{{current_date}}': new Date().toLocaleDateString('pt-BR'),
  '{{unsubscribe_url}}': 'https://app.exemplo.com/unsubscribe/preview-token',
};

function applyFakeVars(html: string): string {
  return Object.entries(FAKE_VARS).reduce(
    (h, [key, val]) => h.split(key).join(val), html,
  );
}

function sanitizeForPreview(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, '')
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
}

function ensureUnsubFooter(html: string): string {
  const url = FAKE_VARS['{{unsubscribe_url}}'];
  if (html.includes(url)) return html;
  const footer = `<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation"
    style="margin-top:32px;">
    <tr><td align="center" style="padding:16px;font-family:Arial,sans-serif;font-size:12px;color:#6c6a64;">
      <a href="${url}" style="color:#cc785c;text-decoration:underline;">Cancelar inscrição</a>
    </td></tr></table>`;
  return html.includes('</body>') ? html.replace('</body>', footer + '</body>') : html + footer;
}

function buildPreviewHtml(raw: string): string {
  let h = sanitizeForPreview(raw);
  h = applyFakeVars(h);
  if (!h.includes(FAKE_VARS['{{unsubscribe_url}}'])) h = ensureUnsubFooter(h);
  return h;
}

function generatePlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/(?:div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Analysis ────────────────────────────────────────────────────────────────

interface LinkInfo {
  text: string;
  url: string;
  type: 'valid' | 'empty' | 'mailto' | 'tel' | 'anchor' | 'unsubscribe' | 'tracked';
}

interface ImageInfo {
  src: string;
  alt: string | null;
  width: string | null;
  height: string | null;
  warnings: string[];
}

interface HtmlAnalysis {
  charCount: number;
  sizeKb: number;
  hasUnsubscribeVar: boolean;
  linkCount: number;
  imageCount: number;
  hasScripts: boolean;
  hasForms: boolean;
  hasIframes: boolean;
  links: LinkInfo[];
  images: ImageInfo[];
}

function analyzeHtml(html: string): HtmlAnalysis {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const links: LinkInfo[] = Array.from(doc.querySelectorAll('a')).map(a => {
    const url = a.getAttribute('href') ?? '';
    const text = a.textContent?.trim().slice(0, 60) ?? '(sem texto)';
    let type: LinkInfo['type'] = 'valid';
    if (!url) type = 'empty';
    else if (url.startsWith('mailto:')) type = 'mailto';
    else if (url.startsWith('tel:')) type = 'tel';
    else if (url.startsWith('#')) type = 'anchor';
    else if (url.includes('unsubscribe') || url.includes('{{unsubscribe')) type = 'unsubscribe';
    else type = 'tracked';
    return { text, url: url.slice(0, 80), type };
  });

  const images: ImageInfo[] = Array.from(doc.querySelectorAll('img')).map(img => {
    const src = img.getAttribute('src') ?? '';
    const alt = img.getAttribute('alt');
    const w = img.getAttribute('width');
    const h = img.getAttribute('height');
    const warnings: string[] = [];
    if (alt === null) warnings.push('Sem atributo alt');
    if (src.startsWith('data:') && src.length > 50000) warnings.push('Base64 >50KB (e-mail pesado)');
    if (src && !src.startsWith('http') && !src.startsWith('//') && !src.startsWith('data:')) {
      warnings.push('URL relativa — pode não renderizar no cliente');
    }
    return {
      src: src.startsWith('data:') ? src.slice(0, 40) + '…' : src.slice(0, 80),
      alt, width: w, height: h, warnings,
    };
  });

  return {
    charCount: html.length,
    sizeKb: Math.round(new Blob([html]).size / 102.4) / 10,
    hasUnsubscribeVar: html.includes('{{unsubscribe_url}}'),
    linkCount: links.length,
    imageCount: images.length,
    hasScripts: (html.match(/<script/gi) ?? []).length > 0,
    hasForms: (html.match(/<form/gi) ?? []).length > 0,
    hasIframes: (html.match(/<iframe/gi) ?? []).length > 0,
    links,
    images,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = 'code' | 'desktop' | 'mobile' | 'plaintext' | 'validation';
type Viewport = 'mobile' | 'tablet' | 'desktop';

const VIEWPORT_WIDTH: Record<Viewport, string> = {
  mobile: '390px',
  tablet: '480px',
  desktop: '600px',
};

interface HtmlViewerProps {
  html: string;
  subject?: string;
  fromEmail?: string;
  fromName?: string;
  plainText?: string;
  onChange?: (html: string) => void;
  onPlainTextChange?: (text: string) => void;
  campaignId?: string;
  readOnly?: boolean;
}

interface CheckItem {
  label: string;
  ok: boolean;
  warn?: boolean;
  info?: string;
}

export function HtmlViewer({
  html, subject, fromEmail, fromName, plainText,
  onChange, onPlainTextChange, campaignId, readOnly = false,
}: HtmlViewerProps) {
  const [tab, setTab] = useState<Tab>('code');
  const [viewport, setViewport] = useState<Viewport>('desktop');
  const [localPlainText, setLocalPlainText] = useState(plainText ?? '');
  const [previewHtml, setPreviewHtml] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const analysis = useMemo(() => analyzeHtml(html), [html]);

  const updatePreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      if (campaignId) {
        const data = await api.post<{ html: string; plain_text: string }>(
          `/api/campaigns/${campaignId}/preview`, {},
        );
        setPreviewHtml(data.html);
        if (!localPlainText && data.plain_text) setLocalPlainText(data.plain_text);
      } else {
        setPreviewHtml(buildPreviewHtml(html));
        if (!localPlainText) setLocalPlainText(generatePlainText(html));
      }
    } finally {
      setLoadingPreview(false);
    }
  }, [html, campaignId, localPlainText]);

  // Auto-update preview when switching to preview tabs
  useEffect(() => {
    if ((tab === 'desktop' || tab === 'mobile') && !previewHtml) {
      void updatePreview();
    }
  }, [tab]);

  const regeneratePlainText = () => {
    const pt = generatePlainText(html);
    setLocalPlainText(pt);
    onPlainTextChange?.(pt);
  };

  const checklist: CheckItem[] = [
    { label: 'HTML preenchido', ok: html.trim().length > 0 },
    { label: 'Assunto preenchido', ok: Boolean(subject?.trim()) },
    { label: 'From Name preenchido', ok: Boolean(fromName?.trim()) },
    { label: 'From Email preenchido', ok: Boolean(fromEmail?.trim()) },
    {
      label: analysis.hasUnsubscribeVar
        ? 'Link de descadastro detectado ({{unsubscribe_url}})'
        : 'Rodapé de descadastro será inserido automaticamente',
      ok: true,
      warn: !analysis.hasUnsubscribeVar,
    },
    { label: 'Sem scripts', ok: !analysis.hasScripts, info: analysis.hasScripts ? 'Scripts serão removidos no envio' : undefined },
    { label: 'Sem iframes', ok: !analysis.hasIframes },
    { label: 'Sem forms', ok: !analysis.hasForms },
    {
      label: `Tamanho do HTML: ${analysis.sizeKb} KB`,
      ok: analysis.sizeKb < 100,
      warn: analysis.sizeKb >= 100,
      info: analysis.sizeKb >= 100 ? 'HTML pesado pode ser bloqueado por alguns provedores' : undefined,
    },
  ];

  const TABS = [
    { id: 'code' as Tab, label: 'HTML' },
    { id: 'desktop' as Tab, label: 'Preview Desktop' },
    { id: 'mobile' as Tab, label: 'Preview Mobile' },
    { id: 'plaintext' as Tab, label: 'Texto Simples' },
    { id: 'validation' as Tab, label: 'Validação' },
  ] as const;

  const LINK_BADGE: Record<LinkInfo['type'], React.ComponentProps<typeof Badge>['variant']> = {
    valid: 'neutral', empty: 'error', mailto: 'neutral', tel: 'neutral',
    anchor: 'neutral', unsubscribe: 'warning', tracked: 'success',
  };
  const LINK_LABEL: Record<LinkInfo['type'], string> = {
    valid: 'válido', empty: 'vazio', mailto: 'mailto', tel: 'tel',
    anchor: 'âncora', unsubscribe: 'descadastro', tracked: 'rastreado',
  };

  return (
    <div className="border border-hairline rounded-xl overflow-hidden bg-canvas">
      {/* Tab bar */}
      <div className="flex border-b border-hairline bg-surface-soft overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'text-ink border-b-2 border-primary bg-canvas'
                : 'text-muted hover:text-ink'
            }`}
          >
            {t.label}
            {t.id === 'validation' && checklist.some(c => !c.ok) && (
              <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-error text-white text-xs">
                {checklist.filter(c => !c.ok).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── HTML code ─────────────────────────────────────────────────────── */}
      {tab === 'code' && (
        <div className="p-4 space-y-3">
          {/* Stats bar */}
          <div className="flex gap-4 flex-wrap text-xs text-muted bg-surface-soft rounded-lg px-3 py-2">
            <span><strong className="text-ink">{analysis.charCount.toLocaleString('pt-BR')}</strong> caracteres</span>
            <span><strong className={analysis.sizeKb >= 100 ? 'text-warning' : 'text-ink'}>{analysis.sizeKb} KB</strong></span>
            <span>
              {analysis.hasUnsubscribeVar
                ? <span className="text-success">✓ Descadastro presente</span>
                : <span className="text-warning">⚠ Rodapé automático</span>}
            </span>
            <span><strong className="text-ink">{analysis.linkCount}</strong> links</span>
            <span><strong className="text-ink">{analysis.imageCount}</strong> imagens</span>
          </div>

          {readOnly ? (
            <pre className="text-xs font-mono bg-surface-dark text-on-dark p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap">
              {html || '(sem HTML)'}
            </pre>
          ) : (
            <Textarea
              rows={18}
              value={html}
              onChange={e => onChange?.(e.target.value)}
              className="font-mono text-xs"
              placeholder="<!DOCTYPE html><html><body>...</body></html>"
            />
          )}
        </div>
      )}

      {/* ── Preview Desktop/Mobile ─────────────────────────────────────── */}
      {(tab === 'desktop' || tab === 'mobile') && (
        <div className="space-y-0">
          {/* Toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-hairline bg-surface-soft">
            <div className="flex gap-1">
              {(['mobile','tablet','desktop'] as Viewport[]).map(v => (
                <button
                  key={v}
                  onClick={() => setViewport(v)}
                  title={v}
                  className={`p-1.5 rounded-md transition-colors ${viewport === v ? 'bg-primary text-white' : 'text-muted hover:text-ink hover:bg-surface-card'}`}
                >
                  {v === 'mobile' ? <Smartphone size={15} /> : v === 'tablet' ? <Tablet size={15} /> : <Monitor size={15} />}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">{VIEWPORT_WIDTH[viewport]}</span>
            <Button size="sm" variant="ghost" onClick={() => void updatePreview()} loading={loadingPreview} className="ml-auto">
              <RefreshCw size={13} />Atualizar
            </Button>
          </div>

          {/* Iframe */}
          <div className="overflow-auto bg-surface-soft/50 p-4 flex justify-center min-h-[500px]">
            {loadingPreview ? (
              <div className="flex items-center text-sm text-muted">Renderizando…</div>
            ) : previewHtml ? (
              <iframe
                ref={iframeRef}
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                title="Email preview"
                style={{
                  width: VIEWPORT_WIDTH[viewport],
                  height: '600px',
                  border: '1px solid #e6dfd8',
                  borderRadius: '8px',
                  backgroundColor: '#fff',
                  flexShrink: 0,
                }}
              />
            ) : (
              <button
                onClick={() => void updatePreview()}
                className="flex flex-col items-center gap-2 text-sm text-muted hover:text-ink"
              >
                <Monitor size={32} />
                Clique para carregar preview
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Plain text ────────────────────────────────────────────────────── */}
      {tab === 'plaintext' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">Texto simples gerado a partir do HTML. Usado como fallback em clientes sem suporte a HTML.</p>
            <Button size="sm" variant="secondary" onClick={regeneratePlainText}>
              <RefreshCw size={13} />Regenerar
            </Button>
          </div>
          {readOnly ? (
            <pre className="text-xs font-mono bg-surface-soft p-4 rounded-lg overflow-auto max-h-96 whitespace-pre-wrap text-body">
              {localPlainText || '(não gerado)'}
            </pre>
          ) : (
            <Textarea
              rows={14}
              value={localPlainText}
              onChange={e => { setLocalPlainText(e.target.value); onPlainTextChange?.(e.target.value); }}
              className="font-mono text-xs"
              placeholder="Texto simples gerado automaticamente…"
            />
          )}
        </div>
      )}

      {/* ── Validation ───────────────────────────────────────────────────── */}
      {tab === 'validation' && (
        <div className="p-4 space-y-6 max-h-[600px] overflow-y-auto">
          {/* Checklist */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Checklist</h3>
            {checklist.map(item => (
              <div key={item.label} className="flex items-start gap-2.5 py-1.5 border-b border-hairline/50 last:border-0">
                {item.ok && !item.warn && <CheckCircle size={15} className="text-success shrink-0 mt-0.5" />}
                {item.ok && item.warn && <AlertTriangle size={15} className="text-warning shrink-0 mt-0.5" />}
                {!item.ok && <XCircle size={15} className="text-error shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-sm text-body">{item.label}</p>
                  {item.info && <p className="text-xs text-muted mt-0.5">{item.info}</p>}
                </div>
              </div>
            ))}
            <div className="flex gap-4 mt-3 text-xs text-muted pt-2">
              <span><Info size={12} className="inline mr-1" /><strong className="text-ink">{analysis.linkCount}</strong> links detectados</span>
              <span><Info size={12} className="inline mr-1" /><strong className="text-ink">{analysis.imageCount}</strong> imagens detectadas</span>
              <span><Info size={12} className="inline mr-1" /><strong className={analysis.links.filter(l => l.type === 'empty').length > 0 ? 'text-error' : 'text-ink'}>{analysis.links.filter(l => l.type === 'empty').length}</strong> links vazios</span>
            </div>
          </div>

          {/* Links table */}
          {analysis.links.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Links encontrados</h3>
              <div className="border border-hairline rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-soft border-b border-hairline">
                      <th className="px-3 py-2 text-left font-medium text-muted">Texto</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">URL</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {analysis.links.map((l, i) => (
                      <tr key={i} className={l.type === 'empty' ? 'bg-error/5' : ''}>
                        <td className="px-3 py-1.5 text-body max-w-[120px] truncate">{l.text || '—'}</td>
                        <td className="px-3 py-1.5 text-muted font-mono max-w-[200px] truncate">{l.url || '(vazio)'}</td>
                        <td className="px-3 py-1.5">
                          <Badge variant={LINK_BADGE[l.type]}>{LINK_LABEL[l.type]}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Images table */}
          {analysis.images.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Imagens encontradas</h3>
              <div className="border border-hairline rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-soft border-b border-hairline">
                      <th className="px-3 py-2 text-left font-medium text-muted">Src</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Alt</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Dimensões</th>
                      <th className="px-3 py-2 text-left font-medium text-muted">Avisos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {analysis.images.map((img, i) => (
                      <tr key={i} className={img.warnings.length > 0 ? 'bg-warning/5' : ''}>
                        <td className="px-3 py-1.5 font-mono text-muted max-w-[160px] truncate">{img.src || '—'}</td>
                        <td className="px-3 py-1.5 text-body">
                          {img.alt === null ? <span className="text-error">sem alt</span> : img.alt || <span className="text-muted">""</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted">
                          {img.width && img.height ? `${img.width}×${img.height}` : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {img.warnings.length > 0
                            ? <span className="text-warning flex items-center gap-1"><AlertTriangle size={11} />{img.warnings[0]}</span>
                            : <CheckCircle size={13} className="text-success" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {analysis.links.length === 0 && analysis.images.length === 0 && (
            <p className="text-xs text-muted text-center py-4">Cole o HTML na aba "HTML" para ver a análise.</p>
          )}
        </div>
      )}
    </div>
  );
}
