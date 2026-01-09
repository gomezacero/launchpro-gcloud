'use client';

interface ComplianceAd {
  adId: string;
  network: 'facebook' | 'tiktok' | 'taboola';
  status: 'allowed' | 'declined';
  adIdAlignment?: string;
  campaignId: number;
  campaignName?: string;
  adLibraryLink?: string;
  lastCheck: string;
  reviewRequest?: {
    status: 'pending' | 'accepted' | 'declined';
    message: string;
    date: string;
  } | null;
  tonicAccountId: string;
  tonicAccountName: string;
}

interface ComplianceAdsTableProps {
  ads: ComplianceAd[];
  loading?: boolean;
  onAdClick: (ad: ComplianceAd) => void;
  onAppealClick: (ad: ComplianceAd) => void;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  onPageChange: (offset: number) => void;
}

export default function ComplianceAdsTable({
  ads,
  loading,
  onAdClick,
  onAppealClick,
  pagination,
  onPageChange,
}: ComplianceAdsTableProps) {
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

  const getStatusBadge = (status: string, reviewRequest?: ComplianceAd['reviewRequest']) => {
    if (status === 'allowed') {
      return (
        <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 text-xs font-medium">
          Approved
        </span>
      );
    }

    if (reviewRequest?.status === 'pending') {
      return (
        <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-medium">
          Appeal Pending
        </span>
      );
    }

    return (
      <span className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 text-xs font-medium">
        Rejected
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
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

  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="animate-pulse">
          <div className="h-10 bg-slate-200 rounded mb-4"></div>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-slate-100 rounded mb-2"></div>
          ))}
        </div>
      </div>
    );
  }

  if (ads.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="text-4xl mb-4">📭</div>
        <h3 className="text-lg font-semibold text-slate-800 mb-2">No ads found</h3>
        <p className="text-slate-500">No ads found matching the selected filters.</p>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/50 border-b border-slate-200/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Ad ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Network
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider min-w-[300px]">
                Campaign
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Last Check
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ads.map((ad) => (
              <tr
                key={`${ad.adId}-${ad.tonicAccountId}`}
                className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                onClick={() => onAdClick(ad)}
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-sm text-slate-800">{ad.adId}</div>
                  <div className="text-xs text-slate-400">{ad.tonicAccountName}</div>
                </td>
                <td className="px-4 py-3">{getNetworkBadge(ad.network)}</td>
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-800" title={ad.campaignName || `Campaign ${ad.campaignId}`}>
                    {ad.campaignName || `Campaign ${ad.campaignId}`}
                  </div>
                  <div className="text-xs text-slate-400">ID: {ad.campaignId}</div>
                </td>
                <td className="px-4 py-3">{getStatusBadge(ad.status, ad.reviewRequest)}</td>
                <td className="px-4 py-3">
                  <div className="text-sm text-slate-600">{formatDate(ad.lastCheck)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {ad.adLibraryLink && (
                      <a
                        href={ad.adLibraryLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                        title="View in Ad Library"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                    {ad.status === 'declined' && !ad.reviewRequest && (
                      <button
                        onClick={() => onAppealClick(ad)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors shadow-sm"
                      >
                        Appeal
                      </button>
                    )}
                    {ad.reviewRequest?.status === 'pending' && (
                      <span className="text-xs text-amber-600 font-medium">Pending...</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-slate-200/50 flex items-center justify-between">
          <div className="text-sm text-slate-500">
            Showing {pagination.offset + 1} - {Math.min(pagination.offset + pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(Math.max(0, pagination.offset - pagination.limit))}
              disabled={pagination.offset === 0}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(pagination.offset + pagination.limit)}
              disabled={!pagination.hasMore}
              className="px-3 py-1.5 rounded-lg text-sm font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
