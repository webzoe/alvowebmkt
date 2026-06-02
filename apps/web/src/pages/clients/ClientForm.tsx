import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Button } from '../../components/ui/Button';
import type { Client } from '../../types';

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface ClientFormProps {
  initial?: Client | null;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel: () => void;
}

export function ClientForm({ initial, onSubmit, onCancel }: ClientFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (initial) {
      reset({
        name: initial.name,
        company_name: initial.company_name ?? '',
        email: initial.email,
        phone: initial.phone ?? '',
        notes: initial.notes ?? '',
      });
    }
  }, [initial, reset]);

  return (
    <form
      onSubmit={e => { void handleSubmit(onSubmit)(e); }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Nome *" {...register('name')} error={errors.name?.message} />
        <Input label="Empresa" {...register('company_name')} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Input label="E-mail *" type="email" {...register('email')} error={errors.email?.message} />
        <Input label="Telefone" {...register('phone')} />
      </div>
      <Textarea label="Observações" rows={3} {...register('notes')} />

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {initial ? 'Salvar' : 'Criar cliente'}
        </Button>
      </div>
    </form>
  );
}
