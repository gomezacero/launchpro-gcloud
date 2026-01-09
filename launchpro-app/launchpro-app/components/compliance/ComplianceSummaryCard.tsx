'use client';

interface ComplianceSummaryCardProps {
  summary: {
    totalAds: number;
    allowedAds: number;
    declinedAds: number;
    pendingReviews: number;
    allowedPercentage: number;
    byNetwork: {
      facebook: { total: number; allowed: number; declined: number };
      tiktok: { total: number; allowed: number; declined: number };
      taboola: { total: number; allowed: number; declined: number };
    };
  };
  loading?: boolean;
}

export default function ComplianceSummaryCard({ summary, loading }: ComplianceSummaryCardProps) {
  if (loading) {
    return (
      <div className="glass-card p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl"></div>
          ))}
        </div>
      </div>
    );
  }

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return { bg: 'from-emerald-50 to-green-50', text: 'text-emerald-600', gradient: 'from-emerald-400 to-green-500' };
    if (percentage >= 70) return { bg: 'from-amber-50 to-yellow-50', text: 'text-amber-600', gradient: 'from-amber-400 to-yellow-500' };
    return { bg: 'from-rose-50 to-red-50', text: 'text-rose-600', gradient: 'from-rose-400 to-red-500' };
  };

  const statusColor = getStatusColor(summary.allowedPercentage);

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500 to-green-600 opacity-5 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
            <span className="text-lg">✅</span>
          </div>
          <h3 className="text-lg font-bold text-slate-800">Compliance Summary</h3>
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Total Ads */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-white/50">
            <div className="text-2xl font-bold text-slate-800">{summary.totalAds}</div>
            <div className="text-sm text-slate-500">Total Ads</div>
          </div>

          {/* Allowed */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-white/50">
            <div className="text-2xl font-bold text-emerald-600">{summary.allowedAds}</div>
            <div className="text-sm text-emerald-500">Approved</div>
          </div>

          {/* Declined */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-rose-50 to-red-50 border border-white/50">
            <div className="text-2xl font-bold text-rose-600">{summary.declinedAds}</div>
            <div className="text-sm text-rose-500">Rejected</div>
          </div>

          {/* Pending Reviews */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-50 to-yellow-50 border border-white/50">
            <div className="text-2xl font-bold text-amber-600">{summary.pendingReviews}</div>
            <div className="text-sm text-amber-500">Pending Appeals</div>
          </div>
        </div>

        {/* Approval Rate Progress */}
        <div className={`p-4 rounded-xl bg-gradient-to-r ${statusColor.bg} border border-white/50 mb-6`}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-slate-700">Approval Rate</span>
            <div className={`px-3 py-1.5 rounded-full bg-white/80 shadow-sm ${statusColor.text} font-bold text-sm`}>
              {summary.allowedPercentage}%
            </div>
          </div>
          <div className="relative h-3 bg-white/50 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-gradient-to-r ${statusColor.gradient}`}
              style={{ width: `${Math.max(3, summary.allowedPercentage)}%` }}
            />
          </div>
        </div>

        {/* Network Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          {/* Meta */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-white/50 text-center">
            <div className="text-xs font-semibold text-blue-600 mb-1">Meta</div>
            <div className="text-lg font-bold text-slate-800">{summary.byNetwork.facebook.total}</div>
            <div className="text-xs text-slate-500">
              <span className="text-emerald-500">{summary.byNetwork.facebook.allowed}</span>
              {' / '}
              <span className="text-rose-500">{summary.byNetwork.facebook.declined}</span>
            </div>
          </div>

          {/* TikTok */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-slate-50 to-slate-100 border border-white/50 text-center">
            <div className="text-xs font-semibold text-slate-700 mb-1">TikTok</div>
            <div className="text-lg font-bold text-slate-800">{summary.byNetwork.tiktok.total}</div>
            <div className="text-xs text-slate-500">
              <span className="text-emerald-500">{summary.byNetwork.tiktok.allowed}</span>
              {' / '}
              <span className="text-rose-500">{summary.byNetwork.tiktok.declined}</span>
            </div>
          </div>

          {/* Taboola */}
          <div className="p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-white/50 text-center">
            <div className="text-xs font-semibold text-orange-600 mb-1">Taboola</div>
            <div className="text-lg font-bold text-slate-800">{summary.byNetwork.taboola.total}</div>
            <div className="text-xs text-slate-500">
              <span className="text-emerald-500">{summary.byNetwork.taboola.allowed}</span>
              {' / '}
              <span className="text-rose-500">{summary.byNetwork.taboola.declined}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
