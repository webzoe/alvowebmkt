import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import type { TrackedLink } from '../../types';

export function CampaignLinksPage() {
  const { id } = useParams<{ id: string }>();
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<TrackedLink[]>(`/api/campaigns/${id}/links`)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const totalClicks = links.reduce((s, l) => s + l.total_clicks, 0);

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Link to={`/campaigns/${id}`} className="p-1.5 text-muted hover:text-ink hover:bg-surface-card rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-ink">Links rastreados</h1>
          <p className="text-sm text-muted mt-0.5">{links.length} links · {totalClicks.toLocaleString('pt-BR')} cliques totais</p>
        </div>
      </div>

      {loading ? <LoadingSpinner className="h-32" /> : links.length === 0 ? (
        <div className="bg-surface-soft rounded-xl p-12 text-center text-sm text-muted">
          Nenhum link rastreado. Os links são detectados automaticamente ao preparar os destinatários.
        </div>
      ) : (
        <div className="bg-canvas border border-hairline rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-soft">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">URL</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted uppercase tracking-wide">Label</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Total</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide">Únicos</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted uppercase tracking-wide"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {links.map(link => (
                <tr key={link.id} className="hover:bg-surface-soft/50">
                  <td className="px-4 py-3 font-mono text-xs text-body max-w-xs truncate">{link.original_url}</td>
                  <td className="px-4 py-3 text-muted">{link.label ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-ink">{link.total_clicks.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right text-success font-medium">{link.unique_clicks.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={link.original_url} target="_blank" rel="noopener noreferrer"
                       className="p-1.5 text-muted hover:text-primary hover:bg-primary/10 rounded-md inline-flex">
                      <ExternalLink size={14} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
