import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Contact, ContactsPaginated } from '../types';

interface ContactsFilter {
  client_id?: string;
  list_id?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function useContacts(filter: ContactsFilter = {}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filter.client_id) params.set('client_id', filter.client_id);
      if (filter.list_id) params.set('list_id', filter.list_id);
      if (filter.status) params.set('status', filter.status);
      if (filter.search) params.set('search', filter.search);
      if (filter.page) params.set('page', String(filter.page));
      if (filter.limit) params.set('limit', String(filter.limit));

      const qs = params.toString();
      const result = await api.get<ContactsPaginated>(`/api/contacts${qs ? '?' + qs : ''}`);
      setContacts(result.data);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar contatos');
    } finally {
      setLoading(false);
    }
  }, [filter.client_id, filter.list_id, filter.status, filter.search, filter.page, filter.limit]);

  useEffect(() => { void load(); }, [load]);

  const createContact = async (data: Record<string, unknown>) =>
    api.post<Contact>('/api/contacts', data);

  const deleteContact = async (id: string) => {
    await api.delete(`/api/contacts/${id}`);
    setContacts(prev => prev.filter(c => c.id !== id));
    setTotal(t => t - 1);
  };

  const suppressContact = async (id: string, reason: string) => {
    const updated = await api.post<Contact>(`/api/contacts/${id}/suppress`, { reason });
    setContacts(prev => prev.map(c => (c.id === id ? updated : c)));
    return updated;
  };

  return { contacts, total, loading, error, reload: load, createContact, deleteContact, suppressContact };
}
