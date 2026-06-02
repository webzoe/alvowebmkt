import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useClients } from '../../hooks/useClients';
import type { SendingServer } from '../../types';

const baseSchema = z.object({
  client_id: z.string().uuid('Selecione um cliente'),
  name: z.string().min(1, 'Nome obrigatório'),
  provider_type: z.enum(['maileroo_api', 'smtp']),
  from_email: z.string().email('E-mail inválido'),
  from_name: z.string().min(1, 'Obrigatório'),
  reply_to: z.string().email().optional().or(z.literal('')),
  daily_limit: z.coerce.number().int().positive().default(1000),
  hourly_limit: z.coerce.number().int().positive().default(100),
  minute_limit: z.coerce.number().int().positive().default(10),
  status: z.enum(['active', 'inactive']).default('active'),
  // Maileroo
  api_key: z.string().optional(),
  // SMTP
  smtp_host: z.string().optional(),
  smtp_port: z.coerce.number().optional(),
  smtp_username: z.string().optional(),
  smtp_password: z.string().optional(),
  smtp_encryption: z.enum(['none', 'ssl', 'tls']).optional(),
});

type RawForm = z.infer<typeof baseSchema>;

function buildSchema(isEditing: boolean) {
  return baseSchema.superRefine((data, ctx) => {
    if (data.provider_type === 'maileroo_api' && !isEditing && !data.api_key) {
      ctx.addIssue({ code: 'custom', path: ['api_key'], message: 'API Key obrigatória' });
    }
    if (data.provider_type === 'smtp') {
      const anyFilled = data.smtp_host || data.smtp_username || data.smtp_password;
      if (!isEditing || anyFilled) {
        if (!data.smtp_host) ctx.addIssue({ code: 'custom', path: ['smtp_host'], message: 'Obrigatório' });
        if (!data.smtp_username) ctx.addIssue({ code: 'custom', path: ['smtp_username'], message: 'Obrigatório' });
        if (!data.smtp_password && !isEditing) ctx.addIssue({ code: 'custom', path: ['smtp_password'], message: 'Obrigatório na criação' });
        if (!data.smtp_port) ctx.addIssue({ code: 'custom', path: ['smtp_port'], message: 'Obrigatório' });
      }
    }
  });
}

interface ServerFormProps {
  initial?: SendingServer | null;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export function ServerForm({ initial, onSubmit, onCancel }: ServerFormProps) {
  const isEditing = Boolean(initial);
  const { clients, loading: clientsLoading } = useClients();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RawForm>({
    resolver: zodResolver(buildSchema(isEditing)),
    defaultValues: { provider_type: 'maileroo_api', status: 'active' },
  });

  const providerType = watch('provider_type');

  useEffect(() => {
    if (initial) {
      reset({
        client_id: initial.client_id,
        name: initial.name,
        provider_type: initial.provider_type,
        from_email: initial.from_email,
        from_name: initial.from_name,
        reply_to: initial.reply_to ?? '',
        daily_limit: initial.daily_limit,
        hourly_limit: initial.hourly_limit,
        minute_limit: initial.minute_limit,
        status: initial.status,
      });
    }
  }, [initial, reset]);

  function handleFormSubmit(raw: RawForm) {
    const { api_key, smtp_host, smtp_port, smtp_username, smtp_password, smtp_encryption, ...base } = raw;

    let credentials: Record<string, unknown> | undefined;
    if (raw.provider_type === 'maileroo_api' && api_key) {
      credentials = { api_key };
    } else if (raw.provider_type === 'smtp' && (smtp_host || smtp_username || smtp_password)) {
      credentials = {
        host: smtp_host,
        port: smtp_port,
        username: smtp_username,
        password: smtp_password,
        encryption: smtp_encryption ?? 'tls',
      };
    }

    const payload: Record<string, unknown> = { ...base };
    if (credentials) payload.credentials = credentials;
    return onSubmit(payload);
  }

  return (
    <form
      onSubmit={e => { void handleSubmit(handleFormSubmit)(e); }}
      className="space-y-5"
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Cliente *"
          {...register('client_id')}
          error={errors.client_id?.message}
          disabled={clientsLoading}
        >
          <option value="">Selecione...</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} {c.company_name ? `– ${c.company_name}` : ''}
            </option>
          ))}
        </Select>
        <Input label="Nome do servidor *" {...register('name')} error={errors.name?.message} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Select label="Provider *" {...register('provider_type')} error={errors.provider_type?.message}>
          <option value="maileroo_api">Maileroo API</option>
          <option value="smtp">SMTP</option>
        </Select>
        <Select label="Status" {...register('status')}>
          <option value="active">Ativo</option>
          <option value="inactive">Inativo</option>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input label="From Email *" type="email" {...register('from_email')} error={errors.from_email?.message} />
        <Input label="From Name *" {...register('from_name')} error={errors.from_name?.message} />
      </div>

      <Input label="Reply-To" type="email" {...register('reply_to')} error={errors.reply_to?.message} />

      <div className="grid grid-cols-3 gap-4">
        <Input label="Limite diário" type="number" {...register('daily_limit')} error={errors.daily_limit?.message} />
        <Input label="Limite/hora" type="number" {...register('hourly_limit')} error={errors.hourly_limit?.message} />
        <Input label="Limite/minuto" type="number" {...register('minute_limit')} error={errors.minute_limit?.message} />
      </div>

      {/* Dynamic credentials */}
      <div className="border border-hairline rounded-xl p-4 space-y-4 bg-surface-soft">
        <p className="text-xs font-medium text-muted uppercase tracking-wide">
          Credenciais {isEditing && '(deixe em branco para manter as existentes)'}
        </p>

        {providerType === 'maileroo_api' && (
          <Input
            label={isEditing ? 'API Key (nova)' : 'API Key *'}
            type="password"
            {...register('api_key')}
            error={errors.api_key?.message}
            placeholder={isEditing ? '••• manter atual •••' : ''}
          />
        )}

        {providerType === 'smtp' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label={isEditing ? 'Host (novo)' : 'Host *'}
                {...register('smtp_host')}
                error={errors.smtp_host?.message}
                placeholder="smtp.exemplo.com"
              />
              <Input
                label={isEditing ? 'Porta' : 'Porta *'}
                type="number"
                {...register('smtp_port')}
                error={errors.smtp_port?.message}
                placeholder="587"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Usuário"
                {...register('smtp_username')}
                error={errors.smtp_username?.message}
                placeholder={isEditing ? '••• manter atual •••' : ''}
              />
              <Input
                label={isEditing ? 'Senha (nova)' : 'Senha *'}
                type="password"
                {...register('smtp_password')}
                error={errors.smtp_password?.message}
                placeholder={isEditing ? '••• manter atual •••' : ''}
              />
            </div>
            <Select label="Criptografia" {...register('smtp_encryption')}>
              <option value="tls">STARTTLS (porta 587)</option>
              <option value="ssl">SSL/TLS (porta 465)</option>
              <option value="none">Nenhuma (porta 25)</option>
            </Select>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Salvar' : 'Criar servidor'}
        </Button>
      </div>
    </form>
  );
}
