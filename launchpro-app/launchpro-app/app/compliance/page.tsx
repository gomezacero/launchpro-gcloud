'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ComplianceSummaryCard,
  ComplianceFilters,
  ComplianceAdsTable,
  ComplianceAdDetails,
  AppealForm,
  ComplianceChangeLog,
} from '@/components/compliance';

// Types
interface ComplianceSummary {
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
}

interface ComplianceAd {
  adId: string;
  network: 'facebook' | 'tiktok' | 'taboola';
  status: 'allowed' | 'declined';
  adIdAlignment?: string;
  campaignId: number;
  campaignName?: string;
  adLibraryLink?: string;
  lastCheck: string;
  content?: any;
  metadata?: any;
  reviewRequest?: {
    status: 'pending' | 'accepted' | 'declined';
    message: string;
    date: string;
  } | null;
  tonicAccountId: string;
  tonicAccountName: string;
}

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

interface Filters {
  networks: string[];
  status: 'all' | 'allowed' | 'declined';
  campaignName: string;
}

export default function CompliancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const initialLoadDone = useRef(false);

  // State
  const [activeTab, setActiveTab] = useState<'ads' | 'changelog'>('ads');
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [ads, setAds] = useState<ComplianceAd[]>([]);
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adsLoading, setAdsLoading] = useState(false);
  const [changeLogsLoading, setChangeLogsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters - these are the "applied" filters
  const [filters, setFilters] = useState<Filters>({
    networks: [],
    status: 'all',
    campaignName: '',
  });

  // Pagination
  const [adsPagination, setAdsPagination] = useState({
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
  });

  const [changeLogsPagination, setChangeLogsPagination] = useState({
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
  });

  // Modals
  const [selectedAd, setSelectedAd] = useState<ComplianceAd | null>(null);
  const [appealAd, setAppealAd] = useState<ComplianceAd | null>(null);

  // Fetch summary
  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/compliance/summary');
      const data = await res.json();
      if (data.success) {
        setSummary(data.data);
      } else {
        console.error('Failed to fetch summary:', data.error);
      }
    } catch (err) {
      console.error('Error fetching summary:', err);
    }
  }, []);

  // Fetch ads with specific filters
  const fetchAdsWithFilters = useCallback(async (filtersToUse: Filters, offset = 0) => {
    setAdsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtersToUse.networks.length > 0) {
        params.set('networks', filtersToUse.networks.join(','));
      }
      if (filtersToUse.status !== 'all') {
        params.set('status', filtersToUse.status);
      }
      if (filtersToUse.campaignName) {
        params.set('campaignName', filtersToUse.campaignName);
      }
      params.set('limit', String(adsPagination.limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/compliance/ads?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setAds(data.data);
        setAdsPagination(data.pagination);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAdsLoading(false);
    }
  }, [adsPagination.limit]);

  // Fetch change logs
  const fetchChangeLogs = useCallback(async (offset = 0) => {
    setChangeLogsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(changeLogsPagination.limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/compliance/changelog?${params.toString()}`);
      const data = await res.json();

      if (data.success) {
        setChangeLogs(data.data);
        setChangeLogsPagination(data.pagination);
      } else {
        console.error('Failed to fetch change logs:', data.error);
      }
    } catch (err) {
      console.error('Error fetching change logs:', err);
    } finally {
      setChangeLogsLoading(false);
    }
  }, [changeLogsPagination.limit]);

  // Send appeal
  const handleSendAppeal = async (adId: string, campaignId: number, message: string) => {
    const res = await fetch(`/api/compliance/ads/${adId}/appeal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, message }),
    });

    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Error sending appeal');
    }

    // Refresh data
    await Promise.all([fetchSummary(), fetchAdsWithFilters(filters, adsPagination.offset)]);
  };

  // Initial load
  useEffect(() => {
    if (status === 'loading') return;
    if (!session) {
      router.push('/login');
      return;
    }

    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    const loadInitialData = async () => {
      setLoading(true);
      await Promise.all([fetchSummary(), fetchAdsWithFilters(filters, 0)]);
      setLoading(false);
    };

    loadInitialData();
  }, [session, status, router, fetchSummary, fetchAdsWithFilters, filters]);

  // Fetch change logs when tab changes
  useEffect(() => {
    if (activeTab === 'changelog' && changeLogs.length === 0 && session) {
      fetchChangeLogs(0);
    }
  }, [activeTab, changeLogs.length, session, fetchChangeLogs]);

  // Handle filter change - just updates state, doesn't trigger search
  const handleFilterChange = (newFilters: Filters) => {
    setFilters(newFilters);
  };

  // Handle explicit search - triggers the fetch
  // Accepts filters directly to avoid async state race condition (single click issue)
  const handleSearch = (filtersToUse: Filters) => {
    fetchAdsWithFilters(filtersToUse, 0);
  };

  // Handle page change
  const handleAdsPageChange = (offset: number) => {
    fetchAdsWithFilters(filters, offset);
  };

  const handleChangeLogsPageChange = (offset: number) => {
    fetchChangeLogs(offset);
  };

  // Loading state
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-10 bg-slate-200 rounded w-1/4 mb-8"></div>
            <div className="h-64 bg-slate-100 rounded-2xl mb-6"></div>
            <div className="h-12 bg-slate-100 rounded-xl mb-4"></div>
            <div className="h-96 bg-slate-100 rounded-2xl"></div>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-12 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Error loading data</h2>
            <p className="text-slate-500 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Compliance</h1>
              <p className="text-sm text-slate-500">Monitor the approval status of your ads</p>
            </div>
            <button
              onClick={() => {
                fetchSummary();
                if (activeTab === 'ads') {
                  fetchAdsWithFilters(filters, adsPagination.offset);
                } else {
                  fetchChangeLogs(changeLogsPagination.offset);
                }
              }}
              className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-6 space-y-6">
        {/* Summary Card */}
        <ComplianceSummaryCard summary={summary!} loading={!summary} />

        {/* Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('ads')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'ads'
                ? 'text-slate-800 border-slate-800'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            Ads
          </button>
          <button
            onClick={() => setActiveTab('changelog')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'changelog'
                ? 'text-slate-800 border-slate-800'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            Change History
          </button>
        </div>

        {/* Ads Tab */}
        {activeTab === 'ads' && (
          <>
            <ComplianceFilters
              filters={filters}
              onFilterChange={handleFilterChange}
              onSearch={handleSearch}
            />
            <ComplianceAdsTable
              ads={ads}
              loading={adsLoading}
              onAdClick={setSelectedAd}
              onAppealClick={setAppealAd}
              pagination={adsPagination}
              onPageChange={handleAdsPageChange}
            />
          </>
        )}

        {/* Change Log Tab */}
        {activeTab === 'changelog' && (
          <ComplianceChangeLog
            logs={changeLogs}
            loading={changeLogsLoading}
            pagination={changeLogsPagination}
            onPageChange={handleChangeLogsPageChange}
          />
        )}
      </div>

      {/* Ad Details Modal */}
      <ComplianceAdDetails
        ad={selectedAd}
        isOpen={!!selectedAd}
        onClose={() => setSelectedAd(null)}
        onAppeal={(ad) => {
          setSelectedAd(null);
          setAppealAd(ad);
        }}
      />

      {/* Appeal Form Modal */}
      <AppealForm
        ad={appealAd}
        isOpen={!!appealAd}
        onClose={() => setAppealAd(null)}
        onSubmit={handleSendAppeal}
      />
    </div>
  );
}
