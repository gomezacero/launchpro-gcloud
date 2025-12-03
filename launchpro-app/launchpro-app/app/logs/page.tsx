'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'api' | 'tonic' | 'meta' | 'tiktok' | 'ai' | 'system';
  message: string;
  details?: any;
  duration?: number;
}

interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const fetchLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory !== 'all') params.append('category', filterCategory);
      if (filterLevel !== 'all') params.append('level', filterLevel);

      const response = await fetch(`/api/logs?${params.toString()}`);
      const data = await response.json();

      if (data.success) {
        setLogs(data.data.logs);
        setStats(data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!confirm('¿Estás seguro de que quieres limpiar todos los logs?')) return;

    try {
      await fetch('/api/logs', { method: 'DELETE' });
      fetchLogs();
    } catch (error) {
      console.error('Error clearing logs:', error);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterCategory, filterLevel]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, filterCategory, filterLevel]);

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warn':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'tonic':
        return 'bg-purple-100 text-purple-800';
      case 'meta':
        return 'bg-blue-100 text-blue-800';
      case 'tiktok':
        return 'bg-pink-100 text-pink-800';
      case 'ai':
        return 'bg-indigo-100 text-indigo-800';
      case 'api':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Sistema de Logs</h1>
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-800 font-medium">Total</div>
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            </div>
            <div className="bg-green-50 rounded-lg shadow p-4">
              <div className="text-sm text-green-700 font-medium">Success</div>
              <div className="text-2xl font-bold text-green-900">{stats.byLevel.success || 0}</div>
            </div>
            <div className="bg-blue-50 rounded-lg shadow p-4">
              <div className="text-sm text-blue-700 font-medium">Info</div>
              <div className="text-2xl font-bold text-blue-900">{stats.byLevel.info || 0}</div>
            </div>
            <div className="bg-yellow-50 rounded-lg shadow p-4">
              <div className="text-sm text-yellow-700 font-medium">Warning</div>
              <div className="text-2xl font-bold text-yellow-900">{stats.byLevel.warn || 0}</div>
            </div>
            <div className="bg-red-50 rounded-lg shadow p-4">
              <div className="text-sm text-red-700 font-medium">Error</div>
              <div className="text-2xl font-bold text-red-900">{stats.byLevel.error || 0}</div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="text-sm font-medium text-gray-900 mr-2">Categoría:</label>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-gray-900"
              >
                <option value="all">Todas</option>
                <option value="api">API</option>
                <option value="tonic">Tonic</option>
                <option value="meta">Meta</option>
                <option value="tiktok">TikTok</option>
                <option value="ai">AI</option>
                <option value="system">Sistema</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-900 mr-2">Nivel:</label>
              <select
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-gray-900"
              >
                <option value="all">Todos</option>
                <option value="info">Info</option>
                <option value="success">Success</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="autoRefresh" className="text-sm font-medium text-gray-900">
                Auto-refresh (3s)
              </label>
            </div>

            <button
              onClick={fetchLogs}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              🔄 Refrescar
            </button>

            <button
              onClick={clearLogs}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              🗑️ Limpiar logs
            </button>
          </div>
        </div>

        {/* Logs */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Logs recientes ({logs.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-800">Cargando logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-800">No hay logs disponibles</div>
          ) : (
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`p-4 border-l-4 ${getLevelColor(log.level)}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getCategoryColor(
                            log.category
                          )}`}
                        >
                          {log.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${getLevelColor(
                            log.level
                          )}`}
                        >
                          {log.level}
                        </span>
                        {log.duration && (
                          <span className="text-xs text-gray-800">
                            ({log.duration}ms)
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {log.message}
                      </div>
                      {log.details && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-800 cursor-pointer hover:text-gray-900">
                            Ver detalles
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto text-gray-900">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    <div className="text-xs text-gray-800 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('es-ES')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
