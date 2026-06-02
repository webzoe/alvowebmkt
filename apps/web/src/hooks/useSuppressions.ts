import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Suppression } from '../types';

export function useSuppressions(clientId?: string) {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = clientId ? `?client_id=${clientId}` : '';
      setSuppressions(await api.get<Suppression[]>(`/api/suppressions${qs}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const addSuppression = async (data: Record<string, unknown>) => {
    const created = await api.post<Suppression>('/api/suppressions', data);
    setSuppressions(prev => [created, ...prev]);
    return created;
  };

  const deleteSuppression = async (id: string) => {
    await api.delete(`/api/suppressions/${id}`);
    setSuppressions(prev => prev.filter(s => s.id !== id));
  };

  return { suppressions, loading, error, reload: load, addSuppression, deleteSuppression };
}
