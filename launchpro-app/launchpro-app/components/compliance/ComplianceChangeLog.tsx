'use client';

interface ChangeLogEntry {
  adId: string;
  campaignId: number;
  campaignName?: string;
  network: string;
  changeType: string;
  prevStatus: string;
  newStatus: string;
  checkedAt: string;
  adLibraryLink?: string;
  tonicAccountId: string;
  tonicAccountName: string;
}

interface ComplianceChangeLogProps {
  logs: ChangeLogEntry[];
  loading?: boolean;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  onPageChange: (offset: number) => void;
}

export default function ComplianceChangeLog({
  logs,
  loading,
  pagination,
  onPageChange,
}: ComplianceChangeLogProps) {
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'allowed') {
      return (
        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium">
          Aprobado
        </span>
      );
    }
    return (
      <span className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-medium">
        Rechazado
      </span>
    );
  };

  const getNetworkBadge = (network: string) => {
    switch (network) {
      case 'facebook':
        return (
          <span className="px-2 py-1 rounded-md bg-blue-100 text-blue-700 text-xs font-medium">
            Meta
          </span>
        );
      case 'tiktok':
        return (
          <span className="px-2 py-1 rounded-md bg-slate-800 text-white text-xs font-medium">
            TikTok
          </span>
        );
      case 'taboola':
        return (
          <span className="px-2 py-1 rounded-md bg-orange-100 text-orange-700 text-xs font-medium">
            Taboola
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
            {network}
          </span>
        );
    }
  };

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Sin cambios recientes</h3>
        <p className="text-slate-500">No hay cambios de estado registrados.</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="p-4 border-b border-slate-200/50">
        <h3 className="font-semibold text-slate-800">Historial de Cambios</h3>
        <p className="text-sm text-slate-500">Cambios recientes en el estado de compliance</p>
      </div>

      {/* Timeline */}
      <div className="divide-y divide-slate-100">
        {logs.map((log, index) => (
          <div key={`${log.adId}-${log.checkedAt}-${index}`} className="p-4 hover:bg-slate-50/50 transition-colors">
            <div className="flex items-start gap-4">
              {/* Status Change Indicator */}
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${
                  log.newStatus === 'allowed' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}></div>
                {index < logs.length - 1 && (
                  <div className="w-0.5 h-full bg-slate-200 mt-2"></div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {getNetworkBadge(log.network)}
                  <span className="font-mono text-sm text-slate-700">{log.adId}</span>
                </div>

                <div className="flex items-center gap-2 text-sm mb-2">
                  {getStatusBadge(log.prevStatus)}
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  {getStatusBadge(log.newStatus)}
                </div>

                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{log.campaignName || `Campaign ${log.campaignId}`}</span>
                  <span>{log.tonicAccountName}</span>
                  <span>{formatDate(log.checkedAt)}</span>
                </div>
              </div>

              {/* Ad Library Link */}
              {log.adLibraryLink && (
                <a
                  href={log.adLibraryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Ver en Ad Library"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-200/50 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Mostrando {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} de {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-600">
              Pagina {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => onPageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.hasMore}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
