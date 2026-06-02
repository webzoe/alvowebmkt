import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Upload, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Textarea } from '../../components/ui/Textarea';
import { useClients } from '../../hooks/useClients';
import { useLists } from '../../hooks/useLists';
import type { ImportJob } from '../../types';

type Step = 'setup' | 'preview' | 'result';

interface ColumnMapping {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  /** Column whose value will be auto-split into first_name + last_name */
  full_name: string | null;
}

interface PreviewData {
  headers: string[];
  sample: string[][];
  rowCount: number;
  detected_mapping?: ColumnMapping;
  extra_columns?: string[];
}

export function NewImportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { clients } = useClients();
  const [clientId, setClientId] = useState(searchParams.get('client_id') ?? '');
  const { lists } = useLists(clientId || undefined);
  const [listId, setListId] = useState(searchParams.get('list_id') ?? '');

  const [step, setStep] = useState<Step>('setup');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ email: null, first_name: null, last_name: null, phone: null, full_name: null });
  const [importResult, setImportResult] = useState<(ImportJob & { error?: string }) | null>(null);

  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = e => setCsvContent((e.target?.result as string) ?? '');
    reader.readAsText(file, 'utf-8');
  }

  async function handlePreview() {
    if (!clientId) { setError('Selecione um cliente'); return; }
    if (!listId) { setError('Selecione uma lista'); return; }
    if (!csvContent.trim()) { setError('Cole ou carregue um CSV'); return; }

    setError('');
    setPreviewing(true);
    try {
      const result = await api.post<PreviewData>('/api/imports/preview', { csv_content: csvContent });
      setPreviewData(result);
      // Use server-side auto-detection
      if (result.detected_mapping) {
        setMapping({ ...result.detected_mapping, full_name: result.detected_mapping.full_name ?? null });
      }
      setStep('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro no preview');
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!mapping.email) { setError('Mapeie ao menos a coluna de e-mail'); return; }
    setError('');
    setImporting(true);
    try {
      const result = await api.post<ImportJob>('/api/imports', {
        client_id: clientId,
        list_id: listId,
        file_name: fileName || null,
        csv_content: csvContent,
        column_mapping: {
          email: mapping.email,
          first_name: mapping.first_name ?? null,
          last_name: mapping.last_name ?? null,
          phone: mapping.phone ?? null,
          full_name: mapping.full_name ?? null,
        },
      });
      setImportResult(result);
      setStep('result');
    } catch (e) {
      setImportResult({ error: e instanceof Error ? e.message : 'Erro na importação' } as ImportJob & { error: string });
      setStep('result');
    } finally {
      setImporting(false);
    }
  }

  const noneOption = <option value="">— nenhuma —</option>;

  return (
    <div className="p-8 max-w-3xl space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/imports" className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Importar CSV</h1>
          <p className="text-sm text-muted mt-0.5">
            {step === 'setup' && 'Passo 1 de 3 — Configurar importação'}
            {step === 'preview' && 'Passo 2 de 3 — Mapear colunas'}
            {step === 'result' && 'Passo 3 de 3 — Resultado'}
          </p>
        </div>
      </div>

      {/* ── Step 1: Setup ─────────────────────────────────────────────────── */}
      {step === 'setup' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Cliente *" value={clientId} onChange={e => { setClientId(e.target.value); setListId(''); }}>
              <option value="">Selecione...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select label="Lista de destino *" value={listId} onChange={e => setListId(e.target.value)} disabled={!clientId}>
              <option value="">Selecione...</option>
              {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-body-strong block">Arquivo CSV</label>
            <div
              className="border-2 border-dashed border-hairline rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-surface-soft/50 transition-colors"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleFile(file);
              }}
            >
              <Upload size={24} className="mx-auto text-muted mb-2" />
              <p className="text-sm text-body">
                {fileName ? <span className="font-medium text-ink">{fileName}</span> : 'Clique ou arraste um arquivo CSV'}
              </p>
              <p className="text-xs text-muted mt-1">Separador vírgula ou ponto e vírgula · UTF-8</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          <div className="relative">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-3">
              <div className="flex-1 h-px bg-hairline" />
              <span className="text-xs text-muted">ou cole o conteúdo</span>
              <div className="flex-1 h-px bg-hairline" />
            </div>
            <div className="pt-8">
              <Textarea
                label=""
                placeholder="email,nome,sobrenome&#10;joao@exemplo.com,João,Silva"
                rows={6}
                value={csvContent}
                onChange={e => { setCsvContent(e.target.value); if (!fileName) setFileName('colado.csv'); }}
                className="font-mono text-xs"
              />
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex justify-end">
            <Button onClick={() => void handlePreview()} loading={previewing} disabled={!csvContent.trim()}>
              Visualizar preview →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Preview & Mapping ─────────────────────────────────────── */}
      {step === 'preview' && previewData && (
        <div className="space-y-6">
          <div className="flex items-center gap-4 bg-surface-card rounded-lg px-4 py-3 text-sm">
            <span className="text-muted">Arquivo:</span>
            <span className="font-medium text-ink">{fileName}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{previewData.rowCount.toLocaleString('pt-BR')} linha{previewData.rowCount !== 1 ? 's' : ''} de dados</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{previewData.headers.length} colunas detectadas</span>
          </div>

          {/* Column mapping */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink">Mapeamento de colunas</h2>
              {previewData.detected_mapping && (
                <span className="text-xs text-success">✓ campos detectados automaticamente</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  ['email',      'E-mail *',          true ],
                  ['first_name', 'Nome / Primeiro nome', false],
                  ['last_name',  'Sobrenome',          false],
                  ['full_name',  'Nome completo (auto-split)', false],
                  ['phone',      'Telefone',           false],
                ] as [keyof ColumnMapping, string, boolean][]
              ).map(([field, label, required]) => {
                const isAuto = previewData.detected_mapping &&
                  (previewData.detected_mapping as ColumnMapping)[field] === mapping[field] &&
                  mapping[field] !== null;
                return (
                  <div key={field} className="relative">
                    <Select
                      label={label}
                      value={mapping[field] ?? ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value || null }))}
                    >
                      {!required && noneOption}
                      {required && <option value="">— selecione —</option>}
                      {previewData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </Select>
                    {isAuto && (
                      <span className="absolute right-8 top-7 text-xs text-success">✓</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Extra columns info */}
            {previewData.extra_columns && previewData.extra_columns.length > 0 && (
              <div className="bg-surface-card rounded-lg px-4 py-3 text-xs space-y-1">
                <p className="font-medium text-muted uppercase tracking-wide">
                  Colunas extras → serão salvas em custom_fields
                </p>
                <div className="flex gap-2 flex-wrap mt-1">
                  {previewData.extra_columns.map(col => (
                    <span key={col} className="bg-canvas border border-hairline rounded px-2 py-0.5 text-body">{col}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Hint about full name */}
            {mapping.first_name && !mapping.last_name && !mapping.full_name && (
              <p className="text-xs text-muted bg-surface-soft rounded-lg px-3 py-2">
                💡 Se a coluna <strong>{mapping.first_name}</strong> contiver nomes completos (ex: "Maria Silva"),
                o primeiro termo será usado como nome e o restante como sobrenome automaticamente.
                Ou mapeie explicitamente como <strong>Nome completo</strong>.
              </p>
            )}
          </div>

          {/* Sample preview */}
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-ink">Amostra (primeiras 5 linhas)</h2>
            <div className="bg-surface-dark rounded-xl overflow-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr>
                    {previewData.headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left text-on-dark-soft border-b border-surface-dark-elevated whitespace-nowrap">
                        {h}
                        {Object.values(mapping).includes(h) && (
                          <span className="ml-1 text-primary">✓</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dark-elevated">
                  {previewData.sample.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-1.5 text-on-dark-soft max-w-32 truncate">{cell || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep('setup')}>← Voltar</Button>
            <Button onClick={() => void handleImport()} loading={importing} disabled={!mapping.email}>
              Importar {previewData.rowCount.toLocaleString('pt-BR')} linhas →
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ────────────────────────────────────────────────── */}
      {step === 'result' && importResult && (
        <div className="space-y-6">
          {importResult.error ? (
            <div className="flex items-center gap-3 text-error bg-error/10 rounded-xl p-5">
              <XCircle size={24} />
              <div>
                <p className="font-medium">Erro na importação</p>
                <p className="text-sm mt-0.5">{importResult.error}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 text-success bg-success/10 rounded-xl p-5">
                <CheckCircle2 size={24} />
                <p className="font-medium">Importação concluída!</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  ['Total de linhas', importResult.total_rows, 'text-ink'],
                  ['Importados', importResult.imported_count, 'text-success'],
                  ['Duplicados', importResult.duplicate_count, 'text-muted'],
                  ['Inválidos', importResult.invalid_count, 'text-warning'],
                  ['Suprimidos', importResult.suppressed_count, 'text-error'],
                ].map(([label, value, color]) => (
                  <div key={label as string} className="bg-canvas border border-hairline rounded-xl p-4">
                    <p className={`text-2xl font-semibold ${color as string}`}>{(value as number).toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-muted mt-0.5">{label as string}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm text-muted">
                Os contatos foram vinculados à lista. Duplicados e suprimidos foram ignorados sem criar erros.
              </p>
            </>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setStep('setup'); setCsvContent(''); setFileName(''); setImportResult(null); }}>
              Nova importação
            </Button>
            <Button onClick={() => navigate('/imports')}>Ver histórico</Button>
          </div>
        </div>
      )}
    </div>
  );
}
