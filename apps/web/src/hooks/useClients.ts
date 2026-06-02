import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Client } from '../types';

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<Client[]>('/api/clients');
      setClients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const createClient = async (data: Partial<Client>) => {
    const created = await api.post<Client>('/api/clients', data);
    setClients(prev => [...prev, created]);
    return created;
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    const updated = await api.put<Client>(`/api/clients/${id}`, data);
    setClients(prev => prev.map(c => (c.id === id ? updated : c)));
    return updated;
  };

  const deleteClient = async (id: string) => {
    await api.delete(`/api/clients/${id}`);
    setClients(prev => prev.filter(c => c.id !== id));
  };

  return { clients, loading, error, reload: load, createClient, updateClient, deleteClient };
}
