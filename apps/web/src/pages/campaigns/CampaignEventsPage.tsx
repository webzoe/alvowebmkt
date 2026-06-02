import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Pagination } from '../../components/ui/Pagination';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { CampaignEvent } from '../../types';
import type { BadgeProps } from '../../components/ui/Badge';

const EVENT_BADGE: Record<string, BadgeProps['variant']> = {
  queued: 'warning', sent: 'success', delivered: 'success',
  opened: 'primary', clicked: 'primary', bounced: 'error',
  soft_bounced: 'warning', complained: 'error', unsubscribed: 'neutral',
  failed: 'error', rejected: 'error', blocked_policy: 'warning',
  paused: 'warning', resumed: 'neutral', cancelled: 'neutral',
};

export function CampaignEventsPage() {
  const { id } = useParams<{ id: string }>();
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const limit = 50;

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (eventType) params.set('event_type', eventType);
    api.get<{ data: CampaignEvent[]; total: number }>(`/api/campaigns/${id}/events?${params.toString()}`)
      .then(r => { setEvents(r.data); setTotal(r.total); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, page, eventType]);

  const EVENT_TYPES = ['queued','sent','delivered','opened','clicked','bounced','soft_bounced',
    'complained','unsubscribed','failed','rejected','blocked_policy','paused','resumed','cancelled'];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/campaigns/${id}`} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Eventos da campanha</h1>
          <p className="text-sm text-muted mt-0.5">{total.toLocaleString('pt-BR')} eventos</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={eventType} onChange={e => { setEventType(e.target.value); setPage(1); }} className="w-48">
          <option value="">Todos os tipos</option>
          {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
      </div>

      {loading ? <LoadingSpinner className="h-32" /> : (
        <div className="space-y-3">
          <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-soft">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Data</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Fonte</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Metadados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {events.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">Nenhum evento.</td></tr>
                ) : events.map(ev => (
                  <tr key={ev.id} className="hover:bg-surface-soft/50">
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={EVENT_BADGE[ev.event_type] ?? 'neutral'}>{ev.event_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {(ev.metadata as { source?: string } | null)?.source ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted font-mono max-w-xs truncate">
                      {ev.metadata ? JSON.stringify(ev.metadata).slice(0, 80) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={total} limit={limit} onChange={setPage} />
        </div>
      )}
    </div>
  );
}
