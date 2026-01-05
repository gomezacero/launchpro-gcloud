'use client';

import { useState } from 'react';

interface ManagerData {
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
}

interface ManagerComparisonProps {
  managers: ManagerData[];
  rankings: {
    byNetRevenue: string[];
    byVelocity: string[];
    byROI: string[];
  };
}

type SortKey = 'monthlyNetRevenue' | 'weeklyVelocity' | 'roi' | 'level';

const levelOrder = ['Rainmaker', 'Scaler', 'Performer', 'Growth', 'Rookie', 'Prospect'];

const levelStyles: Record<string, { gradient: string; bg: string }> = {
  Prospect: { gradient: 'from-slate-500 to-slate-600', bg: 'from-slate-100 to-slate-50' },
  Rookie: { gradient: 'from-blue-500 to-indigo-600', bg: 'from-blue-100 to-indigo-50' },
  Growth: { gradient: 'from-emerald-500 to-green-600', bg: 'from-emerald-100 to-green-50' },
  Performer: { gradient: 'from-violet-500 to-purple-600', bg: 'from-violet-100 to-purple-50' },
  Scaler: { gradient: 'from-orange-500 to-amber-600', bg: 'from-orange-100 to-amber-50' },
  Rainmaker: { gradient: 'from-yellow-400 to-amber-500', bg: 'from-yellow-100 to-amber-50' },
};

export default function ManagerComparison({ managers, rankings }: ManagerComparisonProps) {
  const [sortKey, setSortKey] = useState<SortKey>('monthlyNetRevenue');
  const [sortAsc, setSortAsc] = useState(false);

  // Safe defaults
  const safeManagers = managers || [];
  const safeRankings = {
    byNetRevenue: rankings?.byNetRevenue || [],
    byVelocity: rankings?.byVelocity || [],
    byROI: rankings?.byROI || [],
  };

  const sortedManagers = [...safeManagers].sort((a, b) => {
    let comparison = 0;
    if (sortKey === 'level') {
      comparison = levelOrder.indexOf(a.level) - levelOrder.indexOf(b.level);
    } else {
      comparison = (b[sortKey] as number) - (a[sortKey] as number);
    }
    return sortAsc ? -comparison : comparison;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const getRankBadge = (managerId: string, rankingList: string[]) => {
    const safeList = rankingList || [];
    const rank = safeList.indexOf(managerId) + 1;
    if (rank === 1) return <span className="text-lg">🥇</span>;
    if (rank === 2) return <span className="text-lg">🥈</span>;
    if (rank === 3) return <span className="text-lg">🥉</span>;
    return <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">#{rank}</span>;
  };

  return (
    <div className="glass-card p-6 mt-6 relative overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-violet-500 to-purple-600 opacity-5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">Comparacion de Managers</h3>
          </div>
          <span className="sm:ml-auto text-xs font-semibold text-amber-700 bg-gradient-to-r from-amber-100 to-yellow-50 px-3 py-1.5 rounded-full border border-amber-200/50">
            Solo visible para SUPERADMIN
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-slate-50 to-slate-100/50">
                <th className="text-left py-4 px-4 font-semibold text-slate-600">Manager</th>
                <th
                  className="text-center py-4 px-3 font-semibold text-slate-600 cursor-pointer hover:text-violet-600 transition-colors"
                  onClick={() => handleSort('level')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Nivel
                    {sortKey === 'level' && (
                      <svg className={`w-4 h-4 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </span>
                </th>
                <th
                  className="text-right py-4 px-3 font-semibold text-slate-600 cursor-pointer hover:text-violet-600 transition-colors"
                  onClick={() => handleSort('monthlyNetRevenue')}
                >
                  <span className="flex items-center justify-end gap-1">
                    Net Revenue
                    {sortKey === 'monthlyNetRevenue' && (
                      <svg className={`w-4 h-4 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </span>
                </th>
                <th
                  className="text-center py-4 px-3 font-semibold text-slate-600 cursor-pointer hover:text-violet-600 transition-colors"
                  onClick={() => handleSort('weeklyVelocity')}
                >
                  <span className="flex items-center justify-center gap-1">
                    Velocidad
                    {sortKey === 'weeklyVelocity' && (
                      <svg className={`w-4 h-4 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </span>
                </th>
                <th
                  className="text-right py-4 px-3 font-semibold text-slate-600 cursor-pointer hover:text-violet-600 transition-colors"
                  onClick={() => handleSort('roi')}
                >
                  <span className="flex items-center justify-end gap-1">
                    ROI
                    {sortKey === 'roi' && (
                      <svg className={`w-4 h-4 transition-transform ${sortAsc ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </span>
                </th>
                <th className="text-center py-4 px-3 font-semibold text-slate-600">Alertas</th>
                <th className="text-center py-4 px-3 font-semibold text-slate-600">EverGreen</th>
              </tr>
            </thead>
            <tbody>
              {sortedManagers.map((manager, index) => {
                const style = levelStyles[manager.level] || levelStyles.Prospect;
                return (
                  <tr
                    key={manager.id}
                    className={`border-t border-slate-100 hover:bg-gradient-to-r hover:from-violet-50/50 hover:to-purple-50/50 transition-all duration-200 ${index === 0 ? 'bg-gradient-to-r from-amber-50/30 to-yellow-50/30' : ''}`}
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${style.gradient} flex items-center justify-center shadow-sm`}>
                          <span className="text-white font-bold text-sm">{manager.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{manager.name}</p>
                          <p className="text-xs text-slate-400">{manager.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-4 px-3">
                      <span className={`px-3 py-1.5 text-xs font-bold rounded-full bg-gradient-to-r ${style.bg} border border-white/50`}>
                        <span className={`bg-gradient-to-r ${style.gradient} bg-clip-text text-transparent`}>
                          {manager.level}
                        </span>
                      </span>
                    </td>
                    <td className="text-right py-4 px-3">
                      <div className="flex items-center justify-end gap-2">
                        {getRankBadge(manager.id, safeRankings.byNetRevenue)}
                        <span className="font-bold text-slate-800">
                          ${(manager.monthlyNetRevenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="text-center py-4 px-3">
                      <div className="flex items-center justify-center gap-2">
                        {getRankBadge(manager.id, safeRankings.byVelocity)}
                        <span className="text-slate-700 text-xs">
                          <span className="font-bold">{manager.weeklyVelocity ?? 0}</span>/15 (sem) | <span className="font-bold">{manager.monthlyVelocity ?? 0}</span>/60 (mes)
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-4 px-3">
                      <div className="flex items-center justify-end gap-2">
                        {getRankBadge(manager.id, safeRankings.byROI)}
                        <span className={`font-bold ${(manager.roi ?? 0) >= 30 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          {(manager.roi ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="text-center py-4 px-3">
                      {manager.stopLossViolations > 0 ? (
                        <span className="px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 rounded-full shadow-sm">
                          {manager.stopLossViolations}
                        </span>
                      ) : (
                        <div className="w-6 h-6 mx-auto rounded-full bg-gradient-to-r from-emerald-400 to-green-500 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="text-center py-4 px-3">
                      {manager.everGreenCount > 0 ? (
                        <span className="px-2.5 py-1 text-xs font-bold text-white bg-gradient-to-r from-emerald-500 to-green-600 rounded-full shadow-sm">
                          {manager.everGreenCount}
                        </span>
                      ) : (
                        <span className="text-slate-300 font-medium">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {safeManagers.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">No hay managers para mostrar</p>
          </div>
        )}
      </div>
    </div>
  );
}
