import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { ImportJob } from '../types';

export function useImports(clientId?: string, listId?: string) {
  const [imports, setImports] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('client_id', clientId);
      if (listId) params.set('list_id', listId);
      const qs = params.toString();
      setImports(await api.get<ImportJob[]>(`/api/imports${qs ? '?' + qs : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro');
    } finally {
      setLoading(false);
    }
  }, [clientId, listId]);

  useEffect(() => { void load(); }, [load]);

  return { imports, loading, error, reload: load };
}
