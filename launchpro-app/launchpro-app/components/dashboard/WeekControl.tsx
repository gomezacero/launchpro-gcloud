'use client';

import { useState } from 'react';

interface WeeklySnapshotManager {
  id: string;
  managerId: string;
  managerName: string;
  managerEmail: string;
  campaignsLaunched: number;
  weeklyGoal: number;
  goalAchieved: boolean;
  netRevenue: number;
  roi: number;
  resetAt: string | null;
}

interface WeekSnapshot {
  weekKey: string;
  year: number;
  weekNumber: number;
  weekStart: string;
  weekEnd: string;
  managers: WeeklySnapshotManager[];
}

interface WeekControlProps {
  onWeekReset?: () => void;
}

export default function WeekControl({ onWeekReset }: WeekControlProps) {
  const [isResetting, setIsResetting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<WeekSnapshot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleResetWeek = async () => {
    if (!confirm('Estas seguro de que deseas reiniciar la semana? Se guardara un snapshot del rendimiento actual de todos los managers.')) {
      return;
    }

    setIsResetting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/dashboard/week-reset', {
        method: 'POST',
      });
      const data = await response.json();

      if (response.ok && data.success) {
        setMessage({ type: 'success', text: data.message });
        if (onWeekReset) onWeekReset();
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al reiniciar semana' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Error de conexion' });
    } finally {
      setIsResetting(false);
    }
  };

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/dashboard/week-reset');
      const data = await response.json();

      if (response.ok && data.success) {
        setHistory(data.data.snapshots || []);
      }
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const toggleHistory = () => {
    if (!showHistory && history.length === 0) {
      loadHistory();
    }
    setShowHistory(!showHistory);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="glass-card p-6 mb-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-500 to-indigo-600 opacity-5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Control de Semana</h3>
              <span className="text-xs font-semibold text-amber-700 bg-gradient-to-r from-amber-100 to-yellow-50 px-2 py-0.5 rounded-full">
                Solo SUPERADMIN
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleHistory}
              className="px-4 py-2.5 text-sm font-semibold text-slate-600 bg-white/80 hover:bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300"
            >
              {showHistory ? 'Ocultar Historico' : 'Ver Historico'}
            </button>
            <button
              onClick={handleResetWeek}
              disabled={isResetting}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-xl shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center gap-2"
            >
              {isResetting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Reiniciando...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reiniciar Semana
                </>
              )}
            </button>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div
            className={`mb-4 p-4 rounded-xl text-sm font-medium flex items-center gap-3 ${
              message.type === 'success'
                ? 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200/50'
                : 'bg-gradient-to-r from-rose-50 to-red-50 text-rose-700 border border-rose-200/50'
            }`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${message.type === 'success' ? 'bg-emerald-100' : 'bg-rose-100'}`}>
              {message.type === 'success' ? (
                <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            {message.text}
          </div>
        )}

        {/* Description */}
        <p className="text-sm text-slate-500 mb-4 bg-slate-50 rounded-xl p-4 border border-slate-200/50">
          Al reiniciar la semana se guardara un snapshot del rendimiento actual de todos los managers.
          Las barras de progreso semanal se reiniciaran a 0, pero el historico quedara guardado.
        </p>

        {/* History Section */}
        {showHistory && (
          <div className="mt-6 pt-6 border-t border-slate-200/50">
            <h4 className="text-md font-bold text-slate-800 mb-4 flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              Historico de Semanas
            </h4>

            {loadingHistory ? (
              <div className="flex justify-center py-12">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center animate-pulse">
                  <svg className="animate-spin h-6 w-6 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-slate-200/50">
                <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-slate-500 font-medium">No hay historico de semanas aun</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                {history.map((week) => (
                  <div key={week.weekKey} className="bg-gradient-to-r from-slate-50 to-slate-100/50 rounded-xl p-5 border border-slate-200/50">
                    <div className="flex justify-between items-center mb-4">
                      <h5 className="font-bold text-slate-800">
                        Semana {week.weekNumber}, {week.year}
                      </h5>
                      <span className="text-xs font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200/50">
                        {formatDate(week.weekStart)} - {formatDate(week.weekEnd)}
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200/50">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-white">
                            <th className="py-3 px-3 text-left font-semibold text-slate-600">Manager</th>
                            <th className="py-3 px-3 text-center font-semibold text-slate-600">Campañas</th>
                            <th className="py-3 px-3 text-center font-semibold text-slate-600">Meta</th>
                            <th className="py-3 px-3 text-right font-semibold text-slate-600">Net Revenue</th>
                            <th className="py-3 px-3 text-right font-semibold text-slate-600">ROI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {week.managers.map((manager) => (
                            <tr key={manager.id} className="border-t border-slate-100 bg-white/50">
                              <td className="py-3 px-3">
                                <span className="font-semibold text-slate-800">{manager.managerName}</span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span
                                  className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                    manager.goalAchieved
                                      ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700'
                                      : 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700'
                                  }`}
                                >
                                  {manager.campaignsLaunched}/{manager.weeklyGoal}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-center">
                                {manager.goalAchieved ? (
                                  <div className="w-5 h-5 mx-auto rounded-full bg-gradient-to-r from-emerald-400 to-green-500 flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 mx-auto rounded-full bg-gradient-to-r from-rose-400 to-red-500 flex items-center justify-center">
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <span className={`font-bold ${manager.netRevenue >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                  ${manager.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                <span className={`font-bold ${manager.roi >= 30 ? 'text-emerald-600' : 'text-slate-600'}`}>
                                  {manager.roi.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
