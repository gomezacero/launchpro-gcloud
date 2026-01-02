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
    if (!confirm('¿Estás seguro de que deseas reiniciar la semana? Se guardará un snapshot del rendimiento actual de todos los managers.')) {
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
      setMessage({ type: 'error', text: error.message || 'Error de conexión' });
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
    // Add 'T12:00:00' to avoid timezone issues when parsing date-only strings
    const dateStr = dateString.includes('T') ? dateString : dateString + 'T12:00:00';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">📅</span>
          <h3 className="text-lg font-semibold text-gray-900">Control de Semana</h3>
          <span className="ml-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
            Solo SUPERADMIN
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={toggleHistory}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {showHistory ? 'Ocultar Histórico' : 'Ver Histórico'}
          </button>
          <button
            onClick={handleResetWeek}
            disabled={isResetting}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
          className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Description */}
      <p className="text-sm text-gray-600 mb-4">
        Al reiniciar la semana se guardará un snapshot del rendimiento actual de todos los managers.
        Las barras de progreso semanal se reiniciarán a 0, pero el histórico quedará guardado.
      </p>

      {/* History Section */}
      {showHistory && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h4 className="text-md font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>📊</span> Histórico de Semanas
          </h4>

          {loadingHistory ? (
            <div className="flex justify-center py-8">
              <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No hay histórico de semanas aún</p>
          ) : (
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {history.map((week) => (
                <div key={week.weekKey} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="font-medium text-gray-800">
                      Semana {week.weekNumber}, {week.year}
                    </h5>
                    <span className="text-xs text-gray-500">
                      {formatDate(week.weekStart)} - {formatDate(week.weekEnd)}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-600">
                          <th className="pb-2">Manager</th>
                          <th className="pb-2 text-center">Campañas</th>
                          <th className="pb-2 text-center">Meta</th>
                          <th className="pb-2 text-right">Net Revenue</th>
                          <th className="pb-2 text-right">ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {week.managers.map((manager) => (
                          <tr key={manager.id} className="border-t border-gray-200">
                            <td className="py-2">
                              <span className="font-medium">{manager.managerName}</span>
                            </td>
                            <td className="py-2 text-center">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium ${
                                  manager.goalAchieved
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-yellow-100 text-yellow-700'
                                }`}
                              >
                                {manager.campaignsLaunched}/{manager.weeklyGoal}
                              </span>
                            </td>
                            <td className="py-2 text-center">
                              {manager.goalAchieved ? (
                                <span className="text-green-500">✓</span>
                              ) : (
                                <span className="text-red-500">✗</span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <span className={manager.netRevenue >= 0 ? 'text-green-600' : 'text-red-600'}>
                                ${manager.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <span className={manager.roi >= 30 ? 'text-green-600' : 'text-gray-600'}>
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
  );
}
