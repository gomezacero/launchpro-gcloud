'use client';

interface ComplianceFiltersProps {
  filters: {
    networks: string[];
    status: 'all' | 'allowed' | 'declined';
    campaignName: string;
  };
  onFilterChange: (filters: {
    networks: string[];
    status: 'all' | 'allowed' | 'declined';
    campaignName: string;
  }) => void;
}

export default function ComplianceFilters({ filters, onFilterChange }: ComplianceFiltersProps) {
  const handleNetworkToggle = (network: string) => {
    const newNetworks = filters.networks.includes(network)
      ? filters.networks.filter(n => n !== network)
      : [...filters.networks, network];
    onFilterChange({ ...filters, networks: newNetworks });
  };

  const handleStatusChange = (status: 'all' | 'allowed' | 'declined') => {
    onFilterChange({ ...filters, status });
  };

  const handleCampaignNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFilterChange({ ...filters, campaignName: e.target.value });
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Network Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Red:</span>
          <div className="flex gap-2">
            <button
              onClick={() => handleNetworkToggle('facebook')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filters.networks.includes('facebook')
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Meta
            </button>
            <button
              onClick={() => handleNetworkToggle('tiktok')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filters.networks.includes('tiktok')
                  ? 'bg-slate-800 text-white shadow-md shadow-slate-800/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              TikTok
            </button>
            <button
              onClick={() => handleNetworkToggle('taboola')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                filters.networks.includes('taboola')
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Taboola
            </button>
          </div>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Estado:</span>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => handleStatusChange('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'all'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => handleStatusChange('allowed')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'allowed'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Aprobados
            </button>
            <button
              onClick={() => handleStatusChange('declined')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'declined'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Rechazados
            </button>
          </div>
        </div>

        {/* Campaign Search */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Buscar por nombre de campana..."
            value={filters.campaignName}
            onChange={handleCampaignNameChange}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>
    </div>
  );
}
