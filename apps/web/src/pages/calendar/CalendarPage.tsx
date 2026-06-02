import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useClients } from '../../hooks/useClients';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { STATUS_BADGE, STATUS_LABELS } from '../campaigns/CampaignsPage';
import type { Campaign, CampaignStatus } from '../../types';

const MONTH_NAMES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];
const DOW = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function getCalendarDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const start = new Date(first);
  start.setDate(start.getDate() - offset);
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= last || days.length % 7 !== 0) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function campaignDate(c: Campaign): string {
  return (c.scheduled_at ?? c.completed_at ?? c.created_at).split('T')[0];
}

export function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const { clients } = useClients();

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (clientFilter) params.set('client_id', clientFilter);
    if (statusFilter) params.set('status', statusFilter);
    api.get<Campaign[]>(`/api/campaigns${params.toString() ? '?' + params.toString() : ''}`)
      .then(setCampaigns)
      .catch(() => [])
      .finally(() => setLoading(false));
  }, [clientFilter, statusFilter]);

  const days = getCalendarDays(year, month);

  const byDate = new Map<string, Campaign[]>();
  for (const c of campaigns) {
    const d = campaignDate(c);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(c);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const today = now.toISOString().split('T')[0];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-xl font-semibold text-ink">Calendário</h1>
          <p className="text-sm text-muted mt-0.5">Campanhas agendadas e concluídas</p>
        </div>
        <div className="flex gap-3">
          <Select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="w-44">
            <option value="">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-40">
            <option value="">Todos os status</option>
            {(['scheduled','queued','sending','paused','completed','failed','cancelled'] as CampaignStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-semibold text-ink">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button onClick={nextMonth} className="p-2 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ChevronRight size={18} />
        </button>
      </div>

      {loading ? (
        <LoadingSpinner className="h-64" />
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-hairline">
            {DOW.map(d => (
              <div key={d} className="px-2 py-2 text-center text-xs font-medium text-muted bg-surface-soft">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const key = day.toISOString().split('T')[0];
              const isCurrentMonth = day.getMonth() === month;
              const isToday = key === today;
              const dayCampaigns = byDate.get(key) ?? [];

              return (
                <div
                  key={idx}
                  className={`min-h-[90px] p-1.5 border-b border-r border-hairline ${
                    !isCurrentMonth ? 'bg-surface-soft/30' : ''
                  } ${isToday ? 'bg-primary/5' : ''}`}
                >
                  <span className={`text-xs font-medium block mb-1 ${
                    !isCurrentMonth ? 'text-muted-soft' : isToday ? 'text-primary' : 'text-ink'
                  }`}>
                    {day.getDate()}
                  </span>
                  <div className="space-y-0.5">
                    {dayCampaigns.slice(0, 3).map(camp => (
                      <Link
                        key={camp.id}
                        to={`/campaigns/${camp.id}`}
                        className="block truncate"
                        title={camp.name}
                      >
                        <Badge variant={STATUS_BADGE[camp.status]} >
                          <span className="truncate max-w-[90px] block text-xs">{camp.name}</span>
                        </Badge>
                      </Link>
                    ))}
                    {dayCampaigns.length > 3 && (
                      <span className="text-xs text-muted pl-1">+{dayCampaigns.length - 3} mais</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-3 flex-wrap text-xs text-muted">
        {(['scheduled','queued','sending','paused','completed','failed','cancelled'] as CampaignStatus[]).map(s => (
          <div key={s} className="flex items-center gap-1.5">
            <Badge variant={STATUS_BADGE[s]}>{STATUS_LABELS[s]}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
