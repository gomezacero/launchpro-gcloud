'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface ManagerData {
  id: string;
  name: string;
  email: string;
  lookerReportUrl: string | null;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { isSuperAdmin } = useAuth();
  const [currentManager, setCurrentManager] = useState<ManagerData | null>(null);
  const [allManagers, setAllManagers] = useState<ManagerData[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current manager data
        const meResponse = await fetch('/api/managers/me');
        if (!meResponse.ok) {
          if (meResponse.status === 401) {
            router.push('/login');
            return;
          }
          throw new Error('Error al cargar datos del manager');
        }
        const meData = await meResponse.json();
        setCurrentManager(meData.manager);

        // If SUPERADMIN, also fetch all managers
        if (meData.manager.role === 'SUPERADMIN') {
          const allResponse = await fetch('/api/managers');
          if (allResponse.ok) {
            const allData = await allResponse.json();
            // Filter to only those with configured Looker URLs
            const managersWithLooker = allData.data.filter(
              (m: ManagerData) => m.lookerReportUrl
            );
            setAllManagers(managersWithLooker);
            // Default to first manager with a report if current user has none
            if (!meData.manager.lookerReportUrl && managersWithLooker.length > 0) {
              setSelectedManagerId(managersWithLooker[0].id);
            }
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Get the active report to display
  const getActiveReport = (): ManagerData | null => {
    if (selectedManagerId) {
      return allManagers.find((m) => m.id === selectedManagerId) || null;
    }
    return currentManager;
  };

  const activeReport = getActiveReport();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-white/10 rounded w-48 mb-6"></div>
            <div className="glass-card p-6 rounded-xl">
              <div className="h-[600px] bg-white/5 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="glass-card p-6 rounded-xl border border-red-500/30 bg-red-500/10">
            <h2 className="text-xl font-semibold text-red-400 mb-2">Error</h2>
            <p className="text-white/70">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if there's any report to show
  const hasAnyReport =
    currentManager?.lookerReportUrl || allManagers.length > 0;

  if (!hasAnyReport) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-6">Analytics</h1>
          <div className="glass-card p-8 rounded-xl text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Reporte no configurado
            </h2>
            <p className="text-white/60 max-w-md mx-auto">
              {isSuperAdmin
                ? 'No hay reportes de Looker Studio configurados. Ve a Settings > Managers para configurar los reportes.'
                : 'Tu reporte de Looker Studio aun no ha sido configurado. Contacta al administrador para que asigne tu reporte de analytics.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="text-2xl font-bold text-white">Analytics</h1>

          <div className="flex items-center gap-4">
            {/* Manager selector for SUPERADMIN */}
            {isSuperAdmin && allManagers.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-white/60 text-sm">Ver reporte de:</label>
                <select
                  value={selectedManagerId || 'me'}
                  onChange={(e) =>
                    setSelectedManagerId(
                      e.target.value === 'me' ? null : e.target.value
                    )
                  }
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {currentManager?.lookerReportUrl && (
                    <option value="me" className="bg-slate-800">
                      Mi reporte
                    </option>
                  )}
                  {allManagers.map((manager) => (
                    <option
                      key={manager.id}
                      value={manager.id}
                      className="bg-slate-800"
                    >
                      {manager.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {activeReport?.lookerReportUrl && (
              <a
                href={activeReport.lookerReportUrl.replace('/embed/', '/')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all text-sm"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Abrir en Looker Studio
              </a>
            )}
          </div>
        </div>

        {/* Show selected manager name if viewing someone else's report */}
        {selectedManagerId && (
          <div className="mb-4 flex items-center gap-2">
            <span className="text-white/60 text-sm">Viendo reporte de:</span>
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-sm font-medium">
              {allManagers.find((m) => m.id === selectedManagerId)?.name}
            </span>
          </div>
        )}

        {activeReport?.lookerReportUrl ? (
          <div className="glass-card rounded-xl overflow-hidden">
            <iframe
              key={activeReport.id}
              src={activeReport.lookerReportUrl}
              width="100%"
              height="800"
              frameBorder="0"
              style={{ border: 0 }}
              allowFullScreen
              sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        ) : (
          <div className="glass-card p-8 rounded-xl text-center">
            <p className="text-white/60">
              Selecciona un manager para ver su reporte.
            </p>
          </div>
        )}

        <p className="text-white/40 text-sm mt-4 text-center">
          Si el reporte solicita autenticacion, inicia sesion con tu cuenta de
          Google autorizada.
        </p>
      </div>
    </div>
  );
}
