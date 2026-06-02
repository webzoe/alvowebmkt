import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { useClients } from '../../hooks/useClients';
import { useLists } from '../../hooks/useLists';

const schema = z.object({
  client_id: z.string().uuid('Selecione um cliente'),
  email: z.string().email('E-mail inválido'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  list_id: z.string().uuid().optional().or(z.literal('')),
});

type FormData = z.infer<typeof schema>;

interface ContactFormProps {
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

export function ContactForm({ onSubmit, onCancel }: ContactFormProps) {
  const { clients } = useClients();
  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const selectedClient = watch('client_id');
  const { lists } = useLists(selectedClient || undefined);

  async function handleFormSubmit(data: FormData) {
    const payload: Record<string, unknown> = {
      client_id: data.client_id,
      email: data.email,
      first_name: data.first_name || undefined,
      last_name: data.last_name || undefined,
      phone: data.phone || undefined,
    };
    if (data.list_id) payload.list_id = data.list_id;
    await onSubmit(payload);
  }

  return (
    <form onSubmit={e => { void handleSubmit(handleFormSubmit)(e); }} className="space-y-4">
      <Select label="Cliente *" {...register('client_id')} error={errors.client_id?.message}>
        <option value="">Selecione...</option>
        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Input label="E-mail *" type="email" {...register('email')} error={errors.email?.message} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Nome" {...register('first_name')} />
        <Input label="Sobrenome" {...register('last_name')} />
      </div>
      <Input label="Telefone" {...register('phone')} />
      {selectedClient && (
        <Select label="Vincular à lista (opcional)" {...register('list_id')}>
          <option value="">Nenhuma</option>
          {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </Select>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={isSubmitting}>Criar contato</Button>
      </div>
    </form>
  );
}
