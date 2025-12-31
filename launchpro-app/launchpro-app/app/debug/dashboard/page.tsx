'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface DebugResult {
  endpoint: string;
  status: 'pending' | 'success' | 'error';
  statusCode?: number;
  duration?: number;
  data?: any;
  error?: string;
}

export default function DashboardDebugPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [results, setResults] = useState<DebugResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const isSuperAdmin = session?.user?.role === 'SUPERADMIN';

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  const endpoints = [
    { name: 'Dashboard Metrics', url: '/api/dashboard/metrics', method: 'GET' },
    { name: 'Managers List', url: '/api/managers', method: 'GET', superAdminOnly: true },
    { name: 'Manager Comparison', url: '/api/dashboard/comparison', method: 'GET', superAdminOnly: true },
    { name: 'Weekly Snapshots', url: '/api/dashboard/week-reset', method: 'GET', superAdminOnly: true },
  ];

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);

    const testEndpoints = isSuperAdmin
      ? endpoints
      : endpoints.filter(e => !e.superAdminOnly);

    for (const endpoint of testEndpoints) {
      // Set pending status
      setResults(prev => [...prev, {
        endpoint: endpoint.name,
        status: 'pending'
      }]);

      const startTime = Date.now();

      try {
        const response = await fetch(endpoint.url, {
          method: endpoint.method,
          headers: { 'Content-Type': 'application/json' },
        });

        const duration = Date.now() - startTime;
        const data = await response.json();

        setResults(prev => prev.map(r =>
          r.endpoint === endpoint.name
            ? {
                endpoint: endpoint.name,
                status: response.ok ? 'success' : 'error',
                statusCode: response.status,
                duration,
                data: response.ok ? data : undefined,
                error: !response.ok ? (data.error || `HTTP ${response.status}`) : undefined,
              }
            : r
        ));
      } catch (error: any) {
        const duration = Date.now() - startTime;
        setResults(prev => prev.map(r =>
          r.endpoint === endpoint.name
            ? {
                endpoint: endpoint.name,
                status: 'error',
                duration,
                error: error.message || 'Network error',
              }
            : r
        ));
      }
    }

    setIsRunning(false);
  };

  const formatJson = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🔧</span>
            <h1 className="text-2xl font-bold">Dashboard Debug Console</h1>
            <span className="px-2 py-1 text-xs bg-yellow-500 text-black rounded font-medium">
              TEMPORARY
            </span>
          </div>
          <p className="text-gray-400">
            Validación de APIs y métricas del dashboard. Usuario: {session?.user?.email} ({session?.user?.role})
          </p>
        </div>

        {/* Controls */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={runTests}
            disabled={isRunning}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Running Tests...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run All Tests
              </>
            )}
          </button>
          <button
            onClick={() => setResults([])}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
          >
            Clear Results
          </button>
        </div>

        {/* Endpoints Info */}
        <div className="mb-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">Endpoints to Test</h2>
          <div className="grid gap-2">
            {endpoints.map((ep, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm">
                <span className="px-2 py-1 bg-gray-700 rounded text-xs font-mono">{ep.method}</span>
                <span className="text-gray-300">{ep.url}</span>
                <span className="text-gray-500">- {ep.name}</span>
                {ep.superAdminOnly && (
                  <span className="px-2 py-0.5 bg-purple-900 text-purple-300 rounded text-xs">
                    SUPERADMIN
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Test Results</h2>

            {results.map((result, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg overflow-hidden">
                {/* Result Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-750 border-b border-gray-700">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(result.status)}`}>
                      {result.status.toUpperCase()}
                    </span>
                    <span className="font-medium">{result.endpoint}</span>
                    {result.statusCode && (
                      <span className="text-gray-400 text-sm">HTTP {result.statusCode}</span>
                    )}
                  </div>
                  {result.duration && (
                    <span className="text-gray-400 text-sm">{result.duration}ms</span>
                  )}
                </div>

                {/* Result Body */}
                <div className="p-4">
                  {result.status === 'pending' && (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Testing...
                    </div>
                  )}

                  {result.status === 'error' && (
                    <div className="text-red-400">
                      <span className="font-medium">Error:</span> {result.error}
                    </div>
                  )}

                  {result.status === 'success' && result.data && (
                    <div>
                      {/* Summary */}
                      <div className="mb-3 text-sm text-gray-400">
                        {result.data.success !== undefined && (
                          <span className={result.data.success ? 'text-green-400' : 'text-red-400'}>
                            success: {String(result.data.success)}
                          </span>
                        )}
                        {result.data.data && (
                          <span className="ml-4">
                            data keys: [{Object.keys(result.data.data).join(', ')}]
                          </span>
                        )}
                      </div>

                      {/* Collapsible JSON */}
                      <details className="group">
                        <summary className="cursor-pointer text-sm text-blue-400 hover:text-blue-300">
                          View Full Response
                        </summary>
                        <pre className="mt-2 p-3 bg-gray-900 rounded text-xs overflow-auto max-h-96 text-gray-300">
                          {formatJson(result.data)}
                        </pre>
                      </details>

                      {/* Data Analysis */}
                      {result.data.data && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <h4 className="text-sm font-medium text-gray-300 mb-2">Data Analysis</h4>
                          <DataAnalysis endpoint={result.endpoint} data={result.data.data} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-800 text-center text-gray-500 text-sm">
          Debug page - Remove before production
        </div>
      </div>
    </div>
  );
}

// Component to analyze specific endpoint data
function DataAnalysis({ endpoint, data }: { endpoint: string; data: any }) {
  if (endpoint === 'Dashboard Metrics') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <AnalysisCard
          title="Manager"
          value={data.manager?.name || 'N/A'}
          subtitle={data.manager?.email}
        />
        <AnalysisCard
          title="Level"
          value={data.level?.current || 'N/A'}
          subtitle={`$${(data.level?.monthlyNetRevenue || 0).toLocaleString()}`}
        />
        <AnalysisCard
          title="Weekly Velocity"
          value={`${data.velocity?.weekly?.current || 0}/${data.velocity?.weekly?.goal || 15}`}
          status={(data.velocity?.weekly?.current || 0) >= (data.velocity?.weekly?.goal || 15) ? 'good' : 'warning'}
        />
        <AnalysisCard
          title="Monthly Velocity"
          value={`${data.velocity?.monthly?.current || 0}/${data.velocity?.monthly?.goal || 60}`}
        />
        <AnalysisCard
          title="ROI"
          value={`${(data.effectiveness?.roi || 0).toFixed(1)}%`}
          status={(data.effectiveness?.roi || 0) >= 30 ? 'good' : 'warning'}
        />
        <AnalysisCard
          title="Stop-Loss Alerts"
          value={data.stopLoss?.activeViolations || 0}
          status={(data.stopLoss?.activeViolations || 0) > 0 ? 'error' : 'good'}
        />
        <AnalysisCard
          title="EverGreen Qualified"
          value={data.everGreen?.qualified?.length || 0}
        />
        <AnalysisCard
          title="EverGreen In Progress"
          value={data.everGreen?.inProgress?.length || 0}
        />
      </div>
    );
  }

  if (endpoint === 'Managers List') {
    const managers = Array.isArray(data) ? data : [];
    return (
      <div className="text-sm">
        <p className="text-gray-400 mb-2">Total managers: {managers.length}</p>
        <div className="grid gap-2">
          {managers.map((m: any, idx: number) => (
            <div key={idx} className="flex items-center gap-3 bg-gray-900 p-2 rounded">
              <span className="font-medium">{m.name}</span>
              <span className="text-gray-500">{m.email}</span>
              <span className="text-gray-500">({m._count?.campaigns || 0} campaigns)</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (endpoint === 'Manager Comparison') {
    const managers = data.managers || [];
    return (
      <div className="text-sm">
        <p className="text-gray-400 mb-2">Comparing {managers.length} managers</p>
        {managers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="p-2">Name</th>
                  <th className="p-2">Level</th>
                  <th className="p-2 text-right">Net Revenue</th>
                  <th className="p-2 text-right">Weekly</th>
                  <th className="p-2 text-right">ROI</th>
                </tr>
              </thead>
              <tbody>
                {managers.map((m: any, idx: number) => (
                  <tr key={idx} className="border-t border-gray-800">
                    <td className="p-2">{m.name}</td>
                    <td className="p-2">{m.level}</td>
                    <td className="p-2 text-right">${(m.monthlyNetRevenue || 0).toLocaleString()}</td>
                    <td className="p-2 text-right">{m.weeklyVelocity || 0}/15</td>
                    <td className="p-2 text-right">{(m.roi || 0).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (endpoint === 'Weekly Snapshots') {
    const snapshots = data.snapshots || [];
    return (
      <div className="text-sm">
        <p className="text-gray-400 mb-2">Historical weeks: {snapshots.length}</p>
        <p className="text-gray-400">
          Current week: {data.currentWeek?.start ? new Date(data.currentWeek.start).toLocaleDateString() : 'N/A'} - {data.currentWeek?.end ? new Date(data.currentWeek.end).toLocaleDateString() : 'N/A'}
        </p>
      </div>
    );
  }

  return (
    <pre className="text-xs text-gray-400 overflow-auto">
      {JSON.stringify(data, null, 2).substring(0, 500)}...
    </pre>
  );
}

function AnalysisCard({
  title,
  value,
  subtitle,
  status
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: 'good' | 'warning' | 'error';
}) {
  const statusColors = {
    good: 'border-green-500',
    warning: 'border-yellow-500',
    error: 'border-red-500',
  };

  return (
    <div className={`bg-gray-900 p-3 rounded border-l-2 ${status ? statusColors[status] : 'border-gray-700'}`}>
      <div className="text-gray-500 text-xs">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
      {subtitle && <div className="text-gray-500 text-xs">{subtitle}</div>}
    </div>
  );
}
