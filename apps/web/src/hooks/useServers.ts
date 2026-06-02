import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { SendingServer } from '../types';

export function useServers(clientId?: string) {
  const [servers, setServers] = useState<SendingServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = clientId ? `?client_id=${clientId}` : '';
      const data = await api.get<SendingServer[]>(`/api/servers${qs}`);
      setServers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar servidores');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { void load(); }, [load]);

  const createServer = async (data: Record<string, unknown>) => {
    const created = await api.post<SendingServer>('/api/servers', data);
    setServers(prev => [...prev, created]);
    return created;
  };

  const updateServer = async (id: string, data: Record<string, unknown>) => {
    const updated = await api.put<SendingServer>(`/api/servers/${id}`, data);
    setServers(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  };

  const deleteServer = async (id: string) => {
    await api.delete(`/api/servers/${id}`);
    setServers(prev => prev.filter(s => s.id !== id));
  };

  return { servers, loading, error, reload: load, createServer, updateServer, deleteServer };
}
