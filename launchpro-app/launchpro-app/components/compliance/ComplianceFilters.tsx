'use client';

import { useState } from 'react';

interface Filters {
  networks: string[];
  status: 'all' | 'allowed' | 'declined';
  campaignName: string;
}

interface ComplianceFiltersProps {
  filters: Filters;
  onFilterChange: (filters: Filters) => void;
  onSearch: (filters: Filters) => void; // Receives filters directly to avoid async state issues
}

export default function ComplianceFilters({ filters, onFilterChange, onSearch }: ComplianceFiltersProps) {
  const [localCampaignName, setLocalCampaignName] = useState(filters.campaignName);

  const handleNetworkToggle = (network: string) => {
    const newNetworks = filters.networks.includes(network)
      ? filters.networks.filter(n => n !== network)
      : [...filters.networks, network];
    onFilterChange({ ...filters, networks: newNetworks });
  };

  const handleStatusChange = (status: 'all' | 'allowed' | 'declined') => {
    onFilterChange({ ...filters, status });
  };

  const handleSearchClick = () => {
    const updatedFilters = { ...filters, campaignName: localCampaignName };
    onFilterChange(updatedFilters);
    onSearch(updatedFilters); // Pass filters directly to avoid async state race condition
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  };

  const handleClearSearch = () => {
    setLocalCampaignName('');
    if (filters.campaignName !== '') {
      const updatedFilters = { ...filters, campaignName: '' };
      onFilterChange(updatedFilters);
      onSearch(updatedFilters); // Pass filters directly to avoid async state race condition
    }
  };

  return (
    <div className="glass-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Network Filters */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Network:</span>
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
          <span className="text-sm font-medium text-slate-600">Status:</span>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => handleStatusChange('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'all'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              All
            </button>
            <button
              onClick={() => handleStatusChange('allowed')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'allowed'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Approved
            </button>
            <button
              onClick={() => handleStatusChange('declined')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-all ${
                filters.status === 'declined'
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Rejected
            </button>
          </div>
        </div>

        {/* Campaign Search */}
        <div className="flex-1 min-w-[200px] flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search by campaign name..."
              value={localCampaignName}
              onChange={(e) => setLocalCampaignName(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 pr-8"
            />
            {localCampaignName && (
              <button
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSearchClick}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-900 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search
          </button>
        </div>
      </div>
    </div>
  );
}
