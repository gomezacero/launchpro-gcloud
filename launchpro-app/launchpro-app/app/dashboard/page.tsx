'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  ManagerLevelBadge,
  VelocityProgress,
  EffectivenessGauge,
  StopLossAlerts,
  EverGreenTracker,
  ManagerComparison,
  DashboardSkeleton,
  WeekControl,
} from '@/components/dashboard';

interface DashboardMetrics {
  manager: { id: string; name: string; email: string };
  level: {
    current: string;
    monthlyNetRevenue: number;
    nextLevel: string | null;
    amountToNextLevel: number;
  };
  velocity: {
    weekly: { current: number; goal: number };
    monthly: { current: number; goal: number };
    weekStart: string;
    weekEnd: string;
  };
  effectiveness: {
    roi: number;
    goal: number;
    isAchieving: boolean;
  };
  stopLoss: {
    activeViolations: number;
    campaigns: Array<{
      id: string;
      campaignId: string;
      campaignName: string;
      violationType: 'IMMEDIATE_LOSS' | 'TIME_BASED_LOSS';
      netRevenue: number;
      hoursActive: number | null;
      createdAt: string;
    }>;
  };
  everGreen: {
    qualified: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
      everGreenDate?: string;
    }>;
    inProgress: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
    }>;
  };
}

interface ComparisonData {
  managers: Array<{
    id: string;
    name: string;
    email: string;
    level: string;
    monthlyNetRevenue: number;
    weeklyVelocity: number;
    monthlyVelocity: number;
    roi: number;
    stopLossViolations: number;
    everGreenCount: number;
  }>;
  rankings: {
    byNetRevenue: string[];
    byVelocity: string[];
    byROI: string[];
  };
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [managers, setManagers] = useState<Array<{ id: string; name: string; email: string }>>([]);

  const isSuperAdmin = session?.user?.role === 'SUPERADMIN';

  // Fetch managers list for SUPERADMIN
  useEffect(() => {
    if (isSuperAdmin) {
      fetch('/api/managers')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setManagers(data.data);
          }
        })
        .catch(console.error);
    }
  }, [isSuperAdmin]);

  // Fetch dashboard metrics
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build URL with optional managerId for SUPERADMIN
        const url = selectedManagerId
          ? `/api/dashboard/metrics?managerId=${selectedManagerId}`
          : '/api/dashboard/metrics';

        // OPTIMIZATION: Fetch metrics and comparison IN PARALLEL for SUPERADMIN
        if (isSuperAdmin && !selectedManagerId) {
          const [metricsResponse, compResponse] = await Promise.all([
            fetch(url),
            fetch('/api/dashboard/comparison'),
          ]);

          const [metricsData, compData] = await Promise.all([
            metricsResponse.json(),
            compResponse.json(),
          ]);

          if (!metricsResponse.ok) {
            throw new Error(metricsData.error || 'Error al cargar métricas');
          }

          setMetrics(metricsData.data);
          if (compResponse.ok && compData.success) {
            setComparison(compData.data);
          }
        } else {
          // Regular user or specific manager selected - just fetch metrics
          const response = await fetch(url);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Error al cargar métricas');
          }

          setMetrics(data.data);
          setComparison(null);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [status, router, selectedManagerId, isSuperAdmin]);

  // Refresh data function
  const refreshData = async () => {
    setLoading(true);
    try {
      const url = selectedManagerId
        ? `/api/dashboard/metrics?managerId=${selectedManagerId}`
        : '/api/dashboard/metrics';
      const response = await fetch(url);
      const data = await response.json();
      if (response.ok) {
        setMetrics(data.data);
      }
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle acknowledging a stop-loss violation
  const handleAcknowledge = async (violationId: string) => {
    try {
      const response = await fetch('/api/dashboard/stop-loss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violationId }),
      });

      if (response.ok) {
        // Refresh metrics to update the violations list
        const url = selectedManagerId
          ? `/api/dashboard/metrics?managerId=${selectedManagerId}`
          : '/api/dashboard/metrics';
        const metricsResponse = await fetch(url);
        const data = await metricsResponse.json();
        if (metricsResponse.ok) {
          setMetrics(data.data);
        }
      }
    } catch (err) {
      console.error('Error acknowledging violation:', err);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-indigo-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-indigo-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                Dashboard
              </h1>
              <p className="text-sm text-slate-500">Monitor your campaign performance</p>
            </div>
          </div>
        </div>

        {/* SUPERADMIN Manager Selector */}
        {isSuperAdmin && (
          <div className="mb-6 glass-card p-4 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <label className="text-sm font-semibold text-slate-700">Ver dashboard de:</label>
              </div>
              <select
                value={selectedManagerId || ''}
                onChange={(e) => setSelectedManagerId(e.target.value || null)}
                className="input-aurora flex-1 sm:max-w-xs"
              >
                <option value="">Mi Dashboard (SUPERADMIN)</option>
                {managers.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name} ({manager.email})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 glass-card border-rose-200/50 bg-gradient-to-r from-rose-50/80 to-red-50/80 animate-fade-in-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-rose-700 font-medium">{error}</p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && <DashboardSkeleton />}

        {/* Dashboard Content */}
        {!loading && metrics && (
          <div className="space-y-6 animate-fade-in-up">
            {/* Manager Level Badge */}
            <ManagerLevelBadge level={metrics.level} managerName={metrics.manager.name} />

            {/* Metrics Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <VelocityProgress velocity={metrics.velocity} />
              <EffectivenessGauge effectiveness={metrics.effectiveness} />
              <StopLossAlerts
                violations={metrics.stopLoss.campaigns}
                onAcknowledge={handleAcknowledge}
              />
            </div>

            {/* EverGreen Tracker */}
            <EverGreenTracker
              qualified={metrics.everGreen.qualified}
              inProgress={metrics.everGreen.inProgress}
            />

            {/* Week Control (SUPERADMIN only) */}
            {isSuperAdmin && !selectedManagerId && (
              <WeekControl onWeekReset={refreshData} />
            )}

            {/* Manager Comparison (SUPERADMIN only) */}
            {isSuperAdmin && comparison && !selectedManagerId && (
              <ManagerComparison
                managers={comparison.managers}
                rankings={comparison.rankings}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
