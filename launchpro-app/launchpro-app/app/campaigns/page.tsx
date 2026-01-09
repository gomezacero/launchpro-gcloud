'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface Manager {
  id: string;
  name: string;
  email: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  country: string;
  createdAt: string;
  launchedAt?: string;
  offer: {
    name: string;
    vertical: string;
  };
  platforms: Array<{
    platform: string;
    budget: number;
    status: string;
  }>;
  media: Array<{
    type: string;
    url: string;
  }>;
  createdBy?: {
    id: string;
    name: string;
    email: string;
  };
}

const statusConfig: Record<string, { gradient: string; bg: string; text: string; icon: string }> = {
  DRAFT: { gradient: 'from-slate-400 to-slate-500', bg: 'from-slate-50 to-slate-100', text: 'text-slate-700', icon: '📝' },
  PENDING_ARTICLE: { gradient: 'from-amber-400 to-orange-500', bg: 'from-amber-50 to-orange-50', text: 'text-amber-700', icon: '⏳' },
  ARTICLE_APPROVED: { gradient: 'from-cyan-400 to-teal-500', bg: 'from-cyan-50 to-teal-50', text: 'text-cyan-700', icon: '✓' },
  GENERATING_AI: { gradient: 'from-violet-400 to-purple-500', bg: 'from-violet-50 to-purple-50', text: 'text-violet-700', icon: '🤖' },
  READY_TO_LAUNCH: { gradient: 'from-blue-400 to-indigo-500', bg: 'from-blue-50 to-indigo-50', text: 'text-blue-700', icon: '🎯' },
  LAUNCHING: { gradient: 'from-yellow-400 to-amber-500', bg: 'from-yellow-50 to-amber-50', text: 'text-yellow-700', icon: '🚀' },
  ACTIVE: { gradient: 'from-emerald-400 to-green-500', bg: 'from-emerald-50 to-green-50', text: 'text-emerald-700', icon: '✅' },
  PAUSED: { gradient: 'from-orange-400 to-amber-500', bg: 'from-orange-50 to-amber-50', text: 'text-orange-700', icon: '⏸️' },
  COMPLETED: { gradient: 'from-slate-400 to-slate-500', bg: 'from-slate-50 to-slate-100', text: 'text-slate-700', icon: '🏁' },
  FAILED: { gradient: 'from-rose-400 to-red-500', bg: 'from-rose-50 to-red-50', text: 'text-rose-700', icon: '❌' },
};

const platformConfig: Record<string, { gradient: string; icon: string }> = {
  META: { gradient: 'from-blue-500 to-indigo-600', icon: '📘' },
  TIKTOK: { gradient: 'from-pink-500 to-rose-600', icon: '🎵' },
  TABOOLA: { gradient: 'from-teal-500 to-cyan-600', icon: '📰' },
};

export default function CampaignsPage() {
  const router = useRouter();
  const { isSuperAdmin } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [managerFilter, setManagerFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDuplicate = (e: React.MouseEvent, campaignId: string) => {
    e.preventDefault();
    e.stopPropagation();
    router.push(`/campaigns/new?clone=${campaignId}`);
  };

  const handleDeleteClick = (e: React.MouseEvent, campaignId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmId(campaignId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId) return;

    setDeletingId(deleteConfirmId);
    try {
      const res = await fetch(`/api/campaigns/${deleteConfirmId}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (data.success) {
        // Remove campaign from list
        setCampaigns((prev) => prev.filter((c) => c.id !== deleteConfirmId));
      } else {
        console.error('Error deleting campaign:', data.error);
        alert(`Error deleting campaign: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting campaign:', error);
      alert('Error deleting campaign. Please try again.');
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  };

  // Fetch managers list for SUPERADMIN filter
  useEffect(() => {
    if (isSuperAdmin) {
      fetch('/api/managers')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setManagers(data.data);
          }
        })
        .catch(console.error);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadCampaigns();
  }, [filter, managerFilter]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== 'all') {
        params.set('status', filter);
      }
      if (managerFilter !== 'all' && isSuperAdmin) {
        params.set('managerId', managerFilter);
      }

      const url = params.toString()
        ? `/api/campaigns?${params.toString()}`
        : '/api/campaigns';

      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-indigo-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                {isSuperAdmin ? 'All Campaigns' : 'My Campaigns'}
              </h1>
              <p className="text-sm text-slate-500">Manage and monitor your campaigns</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center bg-white/80 border border-slate-200/50 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  viewMode === 'grid'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="Grid View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all duration-200 ${
                  viewMode === 'list'
                    ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
                title="List View"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>

            <Link
              href="/campaigns/new"
              className="btn-aurora inline-flex items-center gap-2 px-6 py-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Campaign
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="glass-card p-5 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            {/* Status Filter */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'All' },
                { key: 'PENDING_ARTICLE', label: 'Pending Article' },
                { key: 'ARTICLE_APPROVED', label: 'Approved' },
                { key: 'GENERATING_AI', label: 'Generating AI' },
                { key: 'LAUNCHING', label: 'Launching' },
                { key: 'ACTIVE', label: 'Active' },
                { key: 'FAILED', label: 'Failed' },
              ].map((status) => (
                <button
                  key={status.key}
                  onClick={() => setFilter(status.key)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                    filter === status.key
                      ? 'bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg shadow-purple-500/25'
                      : 'bg-white/80 text-slate-600 hover:bg-white hover:shadow-md border border-slate-200/50'
                  }`}
                >
                  {status.label}
                </button>
              ))}
            </div>

            {/* Manager Filter - SUPERADMIN only */}
            {isSuperAdmin && managers.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <select
                  value={managerFilter}
                  onChange={(e) => setManagerFilter(e.target.value)}
                  className="input-aurora text-sm min-w-[180px]"
                >
                  <option value="all">Todos los Managers</option>
                  {managers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25 animate-pulse mb-4">
              <svg className="animate-spin h-8 w-8 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">Loading campaigns...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && campaigns.length === 0 && (
          <div className="glass-card p-12 text-center">
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center mb-6">
              <span className="text-4xl">📭</span>
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">
              No campaigns found
            </h3>
            <p className="text-slate-500 mb-8 max-w-md mx-auto">
              {filter === 'all'
                ? "You haven't created any campaigns yet. Start by creating your first campaign."
                : `No campaigns with status: ${filter.replace(/_/g, ' ')}`}
            </p>
            <Link
              href="/campaigns/new"
              className="btn-aurora inline-flex items-center gap-2 px-8 py-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Your First Campaign
            </Link>
          </div>
        )}

        {/* Campaigns Display */}
        {!loading && campaigns.length > 0 && (
          <>
            {/* Grid View */}
            {viewMode === 'grid' && (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {campaigns.map((campaign) => {
                  const status = statusConfig[campaign.status] || statusConfig.DRAFT;
                  return (
                    <Link
                      key={campaign.id}
                      href={`/campaigns/${campaign.id}`}
                      className="glass-card overflow-hidden hover:shadow-xl hover:scale-[1.02] transition-all duration-300 group"
                    >
                      {/* Campaign Header */}
                      <div className="p-6">
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-bold text-slate-800 truncate group-hover:text-violet-700 transition-colors">
                              {campaign.name}
                            </h3>
                            <p className="text-sm text-slate-500 truncate">
                              {campaign.offer.name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={(e) => handleDuplicate(e, campaign.id)}
                              className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-xl transition-all duration-200"
                              title="Duplicate campaign"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => handleDeleteClick(e, campaign.id)}
                              disabled={deletingId === campaign.id}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all duration-200 disabled:opacity-50"
                              title="Delete campaign"
                            >
                              {deletingId === campaign.id ? (
                                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                              ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div className="mb-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r ${status.bg} ${status.text} border border-white/50`}
                          >
                            <span>{status.icon}</span>
                            {campaign.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        {/* Campaign Info */}
                        <div className="space-y-2.5 mb-4">
                          <div className="flex items-center gap-2.5 text-sm text-slate-600">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                              <span className="text-xs">📊</span>
                            </div>
                            <span className="font-medium">{campaign.campaignType}</span>
                          </div>
                          <div className="flex items-center gap-2.5 text-sm text-slate-600">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                              <span className="text-xs">🌍</span>
                            </div>
                            <span className="font-medium">{campaign.country}</span>
                          </div>
                          <div className="flex items-center gap-2.5 text-sm text-slate-600">
                            <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center">
                              <span className="text-xs">📅</span>
                            </div>
                            <span className="font-medium">
                              {new Date(campaign.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Platforms */}
                        <div className="flex gap-2 mb-4">
                          {campaign.platforms.map((platform, index) => {
                            const config = platformConfig[platform.platform] || platformConfig.META;
                            return (
                              <div
                                key={index}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${config.gradient} shadow-sm`}
                              >
                                {config.icon} {platform.platform}
                              </div>
                            );
                          })}
                        </div>

                        {/* Media Preview */}
                        {campaign.media.length > 0 && (
                          <div className="flex gap-2">
                            {campaign.media.slice(0, 3).map((media, index) => (
                              <div
                                key={index}
                                className="w-14 h-14 bg-slate-100 rounded-xl overflow-hidden border-2 border-white shadow-sm"
                              >
                                {media.type === 'IMAGE' ? (
                                  <img
                                    src={media.url}
                                    alt="Campaign media"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-purple-100">
                                    <span className="text-xl">🎥</span>
                                  </div>
                                )}
                              </div>
                            ))}
                            {campaign.media.length > 3 && (
                              <div className="w-14 h-14 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center border-2 border-white shadow-sm">
                                <span className="text-xs font-bold text-slate-600">
                                  +{campaign.media.length - 3}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Creator info - SUPERADMIN only */}
                        {isSuperAdmin && campaign.createdBy && (
                          <div className="flex items-center gap-2 text-sm text-slate-500 mt-4 pt-4 border-t border-slate-100">
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                              <span className="text-white text-xs font-bold">{campaign.createdBy.name.charAt(0)}</span>
                            </div>
                            <span>Created by: <span className="font-medium text-slate-700">{campaign.createdBy.name}</span></span>
                          </div>
                        )}
                      </div>

                      {/* Campaign Footer */}
                      <div className="bg-gradient-to-r from-slate-50 to-violet-50/50 px-6 py-3 border-t border-slate-100">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 font-medium">View Details</span>
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* List View */}
            {viewMode === 'list' && (
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-slate-50 to-violet-50/30 border-b border-slate-200/50">
                      <tr>
                        <th className="text-left px-6 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Campaign</th>
                        <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                        <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Country</th>
                        <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Platforms</th>
                        <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Created</th>
                        {isSuperAdmin && <th className="text-left px-4 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Owner</th>}
                        <th className="text-right px-6 py-4 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {campaigns.map((campaign) => {
                        const status = statusConfig[campaign.status] || statusConfig.DRAFT;
                        return (
                          <tr
                            key={campaign.id}
                            className="hover:bg-violet-50/30 transition-colors cursor-pointer group"
                            onClick={() => router.push(`/campaigns/${campaign.id}`)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {campaign.media.length > 0 ? (
                                  <div className="w-10 h-10 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0 border border-slate-200">
                                    {campaign.media[0].type === 'IMAGE' ? (
                                      <img
                                        src={campaign.media[0].url}
                                        alt="Campaign"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-100 to-purple-100">
                                        <span className="text-sm">🎥</span>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 bg-gradient-to-br from-slate-100 to-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm">📁</span>
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate max-w-[200px] group-hover:text-violet-700 transition-colors">
                                    {campaign.name}
                                  </div>
                                  <div className="text-xs text-slate-500 truncate max-w-[200px]">
                                    {campaign.offer.name}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${status.bg} ${status.text} border border-white/50`}
                              >
                                <span className="text-[10px]">{status.icon}</span>
                                {campaign.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600 font-medium">{campaign.campaignType}</span>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600 font-medium">{campaign.country}</span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-1.5 flex-wrap">
                                {campaign.platforms.map((platform, index) => {
                                  const config = platformConfig[platform.platform] || platformConfig.META;
                                  return (
                                    <span
                                      key={index}
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold text-white bg-gradient-to-r ${config.gradient}`}
                                    >
                                      {platform.platform}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span className="text-sm text-slate-600">
                                {new Date(campaign.createdAt).toLocaleDateString()}
                              </span>
                            </td>
                            {isSuperAdmin && (
                              <td className="px-4 py-4">
                                {campaign.createdBy && (
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center">
                                      <span className="text-white text-[10px] font-bold">{campaign.createdBy.name.charAt(0)}</span>
                                    </div>
                                    <span className="text-sm text-slate-600">{campaign.createdBy.name}</span>
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={(e) => handleDuplicate(e, campaign.id)}
                                  className="p-2 text-slate-400 hover:text-violet-600 hover:bg-violet-100 rounded-lg transition-all duration-200"
                                  title="Duplicate campaign"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => handleDeleteClick(e, campaign.id)}
                                  disabled={deletingId === campaign.id}
                                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg transition-all duration-200 disabled:opacity-50"
                                  title="Delete campaign"
                                >
                                  {deletingId === campaign.id ? (
                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  )}
                                </button>
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDeleteConfirmId(null)} />
            <div className="relative min-h-screen flex items-center justify-center p-4">
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full">
                <div className="p-6">
                  <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-rose-100 to-red-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 text-center mb-2">
                    Delete Campaign
                  </h3>
                  <p className="text-slate-500 text-center mb-6">
                    Are you sure you want to delete this campaign? This action cannot be undone.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="flex-1 py-3 px-4 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDeleteConfirm}
                      disabled={deletingId === deleteConfirmId}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-semibold hover:from-rose-600 hover:to-red-700 transition-all shadow-lg shadow-rose-500/25 disabled:opacity-50"
                    >
                      {deletingId === deleteConfirmId ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Deleting...
                        </span>
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
