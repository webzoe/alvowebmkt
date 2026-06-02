import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { SendingServer } from '../../types';

const schema = z.object({
  to: z.string().email('E-mail inválido'),
  subject: z.string().min(1, 'Assunto obrigatório'),
  body: z.string().min(1, 'Mensagem obrigatória'),
});

type FormData = z.infer<typeof schema>;

interface SendResult {
  success: boolean;
  response?: Record<string, unknown>;
  error?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  maileroo_api: 'Maileroo API',
  smtp: 'SMTP',
};

export function SendTestPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const [server, setServer] = useState<SendingServer | null>(null);
  const [loadingServer, setLoadingServer] = useState(true);
  const [result, setResult] = useState<SendResult | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!serverId) return;
    api.get<SendingServer>(`/api/servers/${serverId}`)
      .then(setServer)
      .catch(() => setServer(null))
      .finally(() => setLoadingServer(false));
  }, [serverId]);

  async function onSubmit(data: FormData) {
    setResult(null);
    try {
      const res = await api.post<{ success: boolean; response?: Record<string, unknown> }>(
        `/api/send/${serverId}`,
        data,
      );
      setResult({ success: true, response: res.response });
    } catch (e) {
      setResult({ success: false, error: e instanceof Error ? e.message : 'Erro desconhecido' });
    }
  }

  if (loadingServer) return <LoadingSpinner className="h-64" />;
  if (!server) {
    return (
      <div className="p-8">
        <p className="text-error">Servidor não encontrado.</p>
        <Link to="/servers" className="text-sm text-primary hover:underline mt-2 inline-block">← Voltar</Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/servers" className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Testar servidor</h1>
          <p className="text-sm text-muted mt-0.5">Envia um e-mail de teste e salva o log</p>
        </div>
      </div>

      {/* Server info card */}
      <div className="bg-surface-card rounded-xl p-4 flex items-start gap-4 border border-hairline">
        <div className="flex-1 space-y-1">
          <p className="font-medium text-ink text-sm">{server.name}</p>
          <p className="text-xs text-muted">{server.from_name} &lt;{server.from_email}&gt;</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={server.status === 'active' ? 'success' : 'neutral'}>
            {server.status === 'active' ? 'Ativo' : 'Inativo'}
          </Badge>
          <Badge variant="neutral">{PROVIDER_LABELS[server.provider_type] ?? server.provider_type}</Badge>
        </div>
      </div>

      {server.status !== 'active' && (
        <div className="bg-error/10 text-error text-sm px-4 py-3 rounded-lg">
          Este servidor está inativo. Ative-o antes de enviar.
        </div>
      )}

      <form onSubmit={e => { void handleSubmit(onSubmit)(e); }} className="space-y-4">
        <Input
          label="Destinatário *"
          type="email"
          {...register('to')}
          error={errors.to?.message}
          placeholder="teste@exemplo.com"
        />
        <Input
          label="Assunto *"
          {...register('subject')}
          error={errors.subject?.message}
          placeholder="Teste de envio – AlvoWebMkt"
        />
        <Textarea
          label="Mensagem *"
          rows={6}
          {...register('body')}
          error={errors.body?.message}
          placeholder="Olá! Este é um e-mail de teste enviado pela plataforma AlvoWebMkt."
        />

        <Button
          type="submit"
          loading={isSubmitting}
          disabled={server.status !== 'active'}
          className="w-full"
        >
          Enviar e-mail de teste
        </Button>
      </form>

      {result && (
        <div
          className={`rounded-xl border p-5 ${
            result.success
              ? 'bg-success/10 border-success/30'
              : 'bg-error/10 border-error/30'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            {result.success ? (
              <CheckCircle2 size={20} className="text-success" />
            ) : (
              <XCircle size={20} className="text-error" />
            )}
            <span className={`font-medium text-sm ${result.success ? 'text-success' : 'text-error'}`}>
              {result.success ? 'E-mail enviado com sucesso!' : 'Falha no envio'}
            </span>
          </div>

          {result.error && (
            <p className="text-sm text-error font-mono bg-error/10 px-3 py-2 rounded-lg">{result.error}</p>
          )}
          {result.response && (
            <pre className="text-xs text-muted-soft bg-surface-dark/5 px-3 py-2 rounded-lg overflow-auto">
              {JSON.stringify(result.response, null, 2)}
            </pre>
          )}
          <p className="text-xs text-muted mt-3">O resultado foi salvo em send_logs.</p>
        </div>
      )}
    </div>
  );
}
