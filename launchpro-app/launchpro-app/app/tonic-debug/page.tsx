'use client';

import { useState, useEffect } from 'react';

interface Account {
  id: string;
  name: string;
  accountType: string;
}

interface EndpointConfig {
  name: string;
  value: string;
  description: string;
  params: {
    name: string;
    type: 'date' | 'text' | 'select';
    required: boolean;
    options?: { value: string; label: string }[];
    defaultValue?: string;
  }[];
}

const ENDPOINTS: EndpointConfig[] = [
  {
    name: 'Stats by Country (1 día)',
    value: 'stats_by_country',
    description: 'Obtiene clicks, revenue y RPC por campaña y país para UNA fecha específica',
    params: [
      { name: 'date', type: 'date', required: true },
    ],
  },
  {
    name: 'Stats by Country (Rango - Agregado)',
    value: 'stats_by_country_range',
    description: 'Hace múltiples llamadas a stats_by_country y agrega los resultados por rango de fechas',
    params: [
      { name: 'from', type: 'date', required: true },
      { name: 'to', type: 'date', required: true },
    ],
  },
  {
    name: 'EPC Final (Rango)',
    value: 'epc_final',
    description: 'Obtiene EPC (Earnings Per Click) final para un rango de fechas. Endpoint nativo con soporte de rango.',
    params: [
      { name: 'from', type: 'date', required: true },
      { name: 'to', type: 'date', required: true },
      { name: 'campaignId', type: 'text', required: false },
    ],
  },
  {
    name: 'EPC Daily (1 día)',
    value: 'epc_daily',
    description: 'Obtiene EPC diario para UNA fecha específica',
    params: [
      { name: 'date', type: 'date', required: true },
      {
        name: 'type',
        type: 'select',
        required: false,
        options: [
          { value: '', label: 'Todos' },
          { value: 'display', label: 'Display' },
          { value: 'rsoc', label: 'RSOC' },
        ],
      },
    ],
  },
  {
    name: 'Campaign List',
    value: 'campaign_list',
    description: 'Lista de campañas en Tonic',
    params: [
      {
        name: 'state',
        type: 'select',
        required: false,
        options: [
          { value: 'active', label: 'Active' },
          { value: 'pending', label: 'Pending' },
          { value: 'stopped', label: 'Stopped' },
          { value: 'incomplete', label: 'Incomplete' },
        ],
        defaultValue: 'active',
      },
    ],
  },
  {
    name: 'Offers List',
    value: 'offers',
    description: 'Lista de ofertas disponibles',
    params: [
      {
        name: 'type',
        type: 'select',
        required: false,
        options: [
          { value: 'rsoc', label: 'RSOC' },
          { value: 'display', label: 'Display' },
        ],
        defaultValue: 'rsoc',
      },
    ],
  },
];

export default function TonicDebugPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState('stats_by_country');
  const [params, setParams] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Get today and yesterday dates
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  useEffect(() => {
    loadAccounts();
  }, []);

  // Initialize params when endpoint changes
  useEffect(() => {
    const endpoint = ENDPOINTS.find(e => e.value === selectedEndpoint);
    if (endpoint) {
      const initialParams: Record<string, string> = {};
      endpoint.params.forEach(p => {
        if (p.defaultValue) {
          initialParams[p.name] = p.defaultValue;
        } else if (p.type === 'date' && p.name === 'date') {
          initialParams[p.name] = today;
        } else if (p.type === 'date' && p.name === 'from') {
          initialParams[p.name] = sevenDaysAgo;
        } else if (p.type === 'date' && p.name === 'to') {
          initialParams[p.name] = today;
        }
      });
      setParams(initialParams);
    }
  }, [selectedEndpoint]);

  const loadAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?type=TONIC');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data.tonic || []);
        if (data.data.tonic && data.data.tonic.length > 0) {
          setSelectedAccount(data.data.tonic[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  const runTest = async () => {
    if (!selectedAccount) {
      setError('Selecciona una cuenta Tonic');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/tonic-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccount,
          endpoint: selectedEndpoint,
          params,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResult(data);
      } else {
        setError(data.error || 'Error desconocido');
        setResult(data);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentEndpoint = ENDPOINTS.find(e => e.value === selectedEndpoint);

  // Calculate totals for revenue data
  const calculateTotals = () => {
    if (!result?.data) return null;

    // For stats_by_country (array of records with 'revenue' field)
    if (Array.isArray(result.data) && result.data.length > 0 && result.data[0]?.revenue !== undefined) {
      const totalRevenue = result.data.reduce((sum: number, item: any) => sum + parseFloat(item.revenue || '0'), 0);
      const totalClicks = result.data.reduce((sum: number, item: any) => sum + parseInt(item.clicks || '0'), 0);
      return { totalRevenue: totalRevenue.toFixed(2), totalClicks, recordCount: result.data.length };
    }

    // For aggregated data
    if (result.data?.aggregatedByCampaign) {
      const totalRevenue = result.data.aggregatedByCampaign.reduce((sum: number, item: any) => sum + parseFloat(item.total_revenue || '0'), 0);
      const totalClicks = result.data.aggregatedByCampaign.reduce((sum: number, item: any) => sum + parseInt(item.clicks || '0'), 0);
      return {
        totalRevenue: totalRevenue.toFixed(2),
        totalClicks,
        campaignCount: result.data.aggregatedByCampaign.length,
        daysQueried: result.data.daysQueried,
      };
    }

    // For EPC Final data (with 'revenueUsd' field) - ROAS calculation
    if (Array.isArray(result.data) && result.data.length > 0 && result.data[0]?.revenueUsd !== undefined) {
      const totalRevenueUsd = result.data.reduce((sum: number, item: any) => sum + parseFloat(item.revenueUsd || '0'), 0);
      const totalClicks = result.data.reduce((sum: number, item: any) => sum + parseInt(item.clicks || '0'), 0);

      // Group by campaignId for campaign-level totals
      const byCampaign = new Map<string, { revenue: number; clicks: number }>();
      result.data.forEach((item: any) => {
        const existing = byCampaign.get(item.campaignId) || { revenue: 0, clicks: 0 };
        existing.revenue += parseFloat(item.revenueUsd || '0');
        existing.clicks += parseInt(item.clicks || '0');
        byCampaign.set(item.campaignId, existing);
      });

      return {
        totalRevenueUsd: totalRevenueUsd.toFixed(2),
        totalClicks,
        recordCount: result.data.length,
        campaignCount: byCampaign.size,
      };
    }

    // For EPC Daily data (with 'epc' and 'earnings' fields)
    if (Array.isArray(result.data) && result.data.length > 0 && result.data[0]?.epc !== undefined) {
      const totalClicks = result.data.reduce((sum: number, item: any) => sum + parseInt(item.clicks || '0'), 0);
      const totalEarnings = result.data.reduce((sum: number, item: any) => sum + parseFloat(item.earnings || '0'), 0);
      return { totalEarnings: totalEarnings.toFixed(2), totalClicks, recordCount: result.data.length };
    }

    return null;
  };

  const totals = result ? calculateTotals() : null;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Tonic API Debug
          </h1>
          <p className="text-gray-700">
            Prueba diferentes endpoints de Tonic API para verificar datos de revenue, EPC y estadísticas.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-6">Configuracion</h2>

            {/* Account Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Cuenta Tonic
              </label>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Seleccionar cuenta...</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Endpoint Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                Endpoint
              </label>
              <select
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ENDPOINTS.map((endpoint) => (
                  <option key={endpoint.value} value={endpoint.value}>
                    {endpoint.name}
                  </option>
                ))}
              </select>
              {currentEndpoint && (
                <p className="text-xs text-gray-700 mt-1">{currentEndpoint.description}</p>
              )}
            </div>

            {/* Dynamic Parameters */}
            {currentEndpoint?.params.map((param) => (
              <div key={param.name} className="mb-4">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {param.name} {param.required && <span className="text-red-500">*</span>}
                </label>
                {param.type === 'select' ? (
                  <select
                    value={params[param.name] || ''}
                    onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {param.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={param.type}
                    value={params[param.name] || ''}
                    onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                )}
              </div>
            ))}

            {/* Quick Date Buttons */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Atajos de fecha
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setParams({ ...params, date: today, from: today, to: today })}
                  className="px-3 py-1 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setParams({ ...params, date: yesterday, from: yesterday, to: yesterday })}
                  className="px-3 py-1 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Ayer
                </button>
                <button
                  type="button"
                  onClick={() => setParams({ ...params, from: sevenDaysAgo, to: today })}
                  className="px-3 py-1 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Ultimos 7 dias
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
                    setParams({ ...params, from: thirtyDaysAgo, to: today });
                  }}
                  className="px-3 py-1 text-sm text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Ultimos 30 dias
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
                {error}
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={runTest}
              disabled={loading || !selectedAccount}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Ejecutando...
                </>
              ) : (
                'Ejecutar Endpoint'
              )}
            </button>
          </div>

          {/* Results Panel */}
          <div className="space-y-4">
            {/* Totals Summary */}
            {totals && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Resumen</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {totals.totalRevenue !== undefined && (
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-700">${totals.totalRevenue}</div>
                      <div className="text-xs text-green-900 font-medium">Revenue Total</div>
                    </div>
                  )}
                  {totals.totalRevenueUsd !== undefined && (
                    <div className="bg-green-100 rounded-lg p-3 text-center border-2 border-green-400">
                      <div className="text-2xl font-bold text-green-700">${totals.totalRevenueUsd}</div>
                      <div className="text-xs text-green-900 font-semibold">GROSS REVENUE (USD)</div>
                    </div>
                  )}
                  {totals.totalEarnings !== undefined && (
                    <div className="bg-green-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-green-700">${totals.totalEarnings}</div>
                      <div className="text-xs text-green-900 font-medium">Earnings Total</div>
                    </div>
                  )}
                  {totals.totalClicks !== undefined && (
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-blue-700">{totals.totalClicks.toLocaleString()}</div>
                      <div className="text-xs text-blue-900 font-medium">Clicks Total</div>
                    </div>
                  )}
                  {totals.recordCount !== undefined && (
                    <div className="bg-slate-100 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-slate-700">{totals.recordCount}</div>
                      <div className="text-xs text-slate-900 font-medium">Registros</div>
                    </div>
                  )}
                  {totals.campaignCount !== undefined && (
                    <div className="bg-purple-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-purple-700">{totals.campaignCount}</div>
                      <div className="text-xs text-purple-900 font-medium">Campanas</div>
                    </div>
                  )}
                  {totals.daysQueried !== undefined && (
                    <div className="bg-orange-50 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-orange-700">{totals.daysQueried}</div>
                      <div className="text-xs text-orange-900 font-medium">Dias Consultados</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Response Info */}
            {result && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Informacion de Respuesta</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-900 font-medium">Endpoint:</span>
                    <span className="ml-2 font-mono text-blue-700 font-semibold">{result.endpoint}</span>
                  </div>
                  <div>
                    <span className="text-gray-900 font-medium">Duracion:</span>
                    <span className="ml-2 font-mono text-green-700 font-semibold">{result.duration}</span>
                  </div>
                  <div>
                    <span className="text-gray-900 font-medium">Registros:</span>
                    <span className="ml-2 font-mono text-purple-700 font-semibold">{result.recordCount}</span>
                  </div>
                </div>
                {result.params && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <span className="text-gray-900 text-sm font-medium">Parametros:</span>
                    <pre className="mt-1 text-xs bg-slate-100 p-2 rounded overflow-auto text-slate-800">
                      {JSON.stringify(result.params, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* Raw Data */}
            {result && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Datos Raw</h3>
                <pre className="text-xs bg-slate-100 p-4 rounded-lg overflow-auto max-h-[500px] text-slate-800">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}

            {/* Empty State */}
            {!result && !loading && (
              <div className="bg-white shadow rounded-lg p-12 text-center">
                <div className="text-6xl mb-4">API</div>
                <p className="text-gray-900 font-medium">
                  Selecciona un endpoint y parametros, luego haz clic en "Ejecutar Endpoint" para ver los resultados.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Documentation */}
        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Documentacion de Endpoints</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {ENDPOINTS.map((endpoint) => (
              <div key={endpoint.value} className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-1">{endpoint.name}</h4>
                <p className="text-sm text-gray-800 mb-2">{endpoint.description}</p>
                <div className="text-xs">
                  <span className="font-semibold text-gray-900">Parametros: </span>
                  {endpoint.params.map((p, idx) => (
                    <span key={p.name} className="font-mono text-blue-700">
                      {p.name}
                      {p.required && <span className="text-red-600">*</span>}
                      {idx < endpoint.params.length - 1 && <span className="text-gray-500">, </span>}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
