import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  total: number;
  limit: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, limit, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between text-sm text-muted py-1">
      <span className="tabular">
        {start.toLocaleString('pt-BR')}–{end.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Página anterior"
          className="p-1.5 rounded-lg border border-hairline text-muted hover:text-ink hover:bg-surface-soft transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-3 text-body-strong tabular">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Próxima página"
          className="p-1.5 rounded-lg border border-hairline text-muted hover:text-ink hover:bg-surface-soft transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
