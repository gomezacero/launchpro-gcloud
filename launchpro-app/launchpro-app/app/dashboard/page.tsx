'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import {
  ManagerLevelBadge,
  VelocityProgress,
  EffectivenessGauge,
  StopLossAlerts,
  EverGreenTracker,
  ManagerComparison,
  DashboardSkeleton,
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

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Error al cargar métricas');
        }

        setMetrics(data.data);

        // Fetch comparison data for SUPERADMIN
        if (isSuperAdmin && !selectedManagerId) {
          const compResponse = await fetch('/api/dashboard/comparison');
          const compData = await compResponse.json();
          if (compResponse.ok && compData.success) {
            setComparison(compData.data);
          }
        } else {
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
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <DashboardSkeleton />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* SUPERADMIN Manager Selector */}
        {isSuperAdmin && (
          <div className="mb-6 flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Ver dashboard de:</label>
            <select
              value={selectedManagerId || ''}
              onChange={(e) => setSelectedManagerId(e.target.value || null)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Mi Dashboard (SUPERADMIN)</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.name} ({manager.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && <DashboardSkeleton />}

        {/* Dashboard Content */}
        {!loading && metrics && (
          <div className="space-y-6">
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
