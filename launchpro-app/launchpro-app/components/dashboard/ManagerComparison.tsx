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
    if (rank === 1) return <span className="text-yellow-500">🥇</span>;
    if (rank === 2) return <span className="text-gray-400">🥈</span>;
    if (rank === 3) return <span className="text-orange-400">🥉</span>;
    return <span className="text-gray-400 text-xs">#{rank}</span>;
  };

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      Prospect: 'bg-gray-100 text-gray-700',
      Rookie: 'bg-blue-100 text-blue-700',
      Growth: 'bg-green-100 text-green-700',
      Performer: 'bg-purple-100 text-purple-700',
      Scaler: 'bg-orange-100 text-orange-700',
      Rainmaker: 'bg-yellow-100 text-yellow-700',
    };
    return colors[level] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">👥</span>
        <h3 className="text-lg font-semibold text-gray-900">Comparación de Managers</h3>
        <span className="ml-auto text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
          Solo visible para SUPERADMIN
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-2 font-medium text-gray-600">Manager</th>
              <th
                className="text-center py-3 px-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('level')}
              >
                Nivel {sortKey === 'level' && (sortAsc ? '↑' : '↓')}
              </th>
              <th
                className="text-right py-3 px-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('monthlyNetRevenue')}
              >
                Net Revenue {sortKey === 'monthlyNetRevenue' && (sortAsc ? '↑' : '↓')}
              </th>
              <th
                className="text-center py-3 px-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('weeklyVelocity')}
              >
                Velocidad {sortKey === 'weeklyVelocity' && (sortAsc ? '↑' : '↓')}
              </th>
              <th
                className="text-right py-3 px-2 font-medium text-gray-600 cursor-pointer hover:bg-gray-50"
                onClick={() => handleSort('roi')}
              >
                ROI {sortKey === 'roi' && (sortAsc ? '↑' : '↓')}
              </th>
              <th className="text-center py-3 px-2 font-medium text-gray-600">Alertas</th>
              <th className="text-center py-3 px-2 font-medium text-gray-600">EverGreen</th>
            </tr>
          </thead>
          <tbody>
            {sortedManagers.map((manager) => (
              <tr key={manager.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2">
                  <div>
                    <p className="font-medium text-gray-900">{manager.name}</p>
                    <p className="text-xs text-gray-500">{manager.email}</p>
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded ${getLevelBadge(manager.level)}`}>
                    {manager.level}
                  </span>
                </td>
                <td className="text-right py-3 px-2">
                  <div className="flex items-center justify-end gap-1">
                    {getRankBadge(manager.id, safeRankings.byNetRevenue)}
                    <span className="font-medium">
                      ${(manager.monthlyNetRevenue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  <div className="flex items-center justify-center gap-1">
                    {getRankBadge(manager.id, safeRankings.byVelocity)}
                    <span>
                      {manager.weeklyVelocity ?? 0}/15 (sem) | {manager.monthlyVelocity ?? 0}/60 (mes)
                    </span>
                  </div>
                </td>
                <td className="text-right py-3 px-2">
                  <div className="flex items-center justify-end gap-1">
                    {getRankBadge(manager.id, safeRankings.byROI)}
                    <span className={(manager.roi ?? 0) >= 30 ? 'text-green-600 font-medium' : 'text-gray-900'}>
                      {(manager.roi ?? 0).toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="text-center py-3 px-2">
                  {manager.stopLossViolations > 0 ? (
                    <span className="px-2 py-1 text-xs font-bold text-red-700 bg-red-100 rounded-full">
                      {manager.stopLossViolations}
                    </span>
                  ) : (
                    <span className="text-green-500">✓</span>
                  )}
                </td>
                <td className="text-center py-3 px-2">
                  {manager.everGreenCount > 0 ? (
                    <span className="px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full">
                      {manager.everGreenCount}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {safeManagers.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">No hay managers para mostrar</p>
        </div>
      )}
    </div>
  );
}
