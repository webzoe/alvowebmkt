import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ContactList } from '../types';

export function useLists(clientId?: string) {
  const [lists, setLists] = useState<ContactList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = clientId ? `?client_id=${clientId}` : '';
      setLists(await api.get<ContactList[]>(`/api/lists${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar listas');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const createList = async (data: Partial<ContactList>) => {
    const created = await api.post<ContactList>('/api/lists', data);
    setLists(prev => [...prev, created]);
    return created;
  };

  const updateList = async (id: string, data: Partial<ContactList>) => {
    const updated = await api.put<ContactList>(`/api/lists/${id}`, data);
    setLists(prev => prev.map(l => (l.id === id ? updated : l)));
    return updated;
  };

  const deleteList = async (id: string) => {
    await api.delete(`/api/lists/${id}`);
    setLists(prev => prev.filter(l => l.id !== id));
  };

  return { lists, loading, error, reload: load, createList, updateList, deleteList };
}
