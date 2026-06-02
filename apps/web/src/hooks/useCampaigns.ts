import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Campaign } from '../types';

export function useCampaigns(clientId?: string, status?: string) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (clientId) params.set('client_id', clientId);
      if (status) params.set('status', status);
      const qs = params.toString();
      setCampaigns(await api.get<Campaign[]>(`/api/campaigns${qs ? '?' + qs : ''}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar campanhas');
    } finally {
      setLoading(false);
    }
  }, [clientId, status]);

  useEffect(() => { void load(); }, [load]);

  return { campaigns, loading, error, reload: load };
}
