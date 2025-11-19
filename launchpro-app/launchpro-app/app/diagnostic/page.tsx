'use client';

import { useState, useEffect } from 'react';

interface Account {
  id: string;
  name: string;
  accountType: string;
}

export default function DiagnosticPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [loading, setLoading] = useState(false);
  const [diagnostics, setDiagnostics] = useState<any>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await fetch('/api/accounts?type=TONIC');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.data.tonic || []);
        // Auto-select first account
        if (data.data.tonic && data.data.tonic.length > 0) {
          setSelectedAccount(data.data.tonic[0].id);
        }
      }
    } catch (err) {
      console.error('Error loading accounts:', err);
    }
  };

  const runDiagnostic = async () => {
    if (!selectedAccount) {
      alert('Please select an account');
      return;
    }

    setLoading(true);
    setDiagnostics(null);

    try {
      const res = await fetch(`/api/diagnostic/tonic?accountId=${selectedAccount}`);
      const data = await res.json();
      setDiagnostics(data.diagnostics);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'PASS' ? 'text-green-600' : 'text-red-600';
  };

  const getStatusIcon = (status: string) => {
    return status === 'PASS' ? '✅' : '❌';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔍 Tonic API Diagnostic Tool
          </h1>
          <p className="text-gray-600">
            Test your Tonic account permissions and capabilities
          </p>
        </div>

        {/* Account Selection */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Select Tonic Account</h2>

          <div className="flex gap-4">
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select account...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>

            <button
              onClick={runDiagnostic}
              disabled={!selectedAccount || loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Running...
                </>
              ) : (
                '▶️ Run Diagnostic'
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        {diagnostics && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">📊 Summary</h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-600">{diagnostics.summary.total}</div>
                  <div className="text-sm text-gray-600">Total Tests</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">{diagnostics.summary.passed}</div>
                  <div className="text-sm text-gray-600">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">{diagnostics.summary.failed}</div>
                  <div className="text-sm text-gray-600">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-600">{diagnostics.summary.successRate}</div>
                  <div className="text-sm text-gray-600">Success Rate</div>
                </div>
              </div>

              {/* Account Info */}
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-gray-600">
                  <strong>Account:</strong> {diagnostics.accountName}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Tested:</strong> {new Date(diagnostics.timestamp).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Recommendations */}
            {diagnostics.recommendations && diagnostics.recommendations.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">💡 Recommendations</h2>
                <div className="space-y-3">
                  {diagnostics.recommendations.map((rec: any, index: number) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg ${
                        rec.type === 'SUCCESS' ? 'bg-green-50 border border-green-200' :
                        rec.type === 'WARNING' ? 'bg-yellow-50 border border-yellow-200' :
                        'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <p className={`text-sm font-medium ${
                        rec.type === 'SUCCESS' ? 'text-green-800' :
                        rec.type === 'WARNING' ? 'text-yellow-800' :
                        'text-blue-800'
                      }`}>
                        {rec.type === 'SUCCESS' && '✅ '}
                        {rec.type === 'WARNING' && '⚠️ '}
                        {rec.type === 'INFO' && 'ℹ️ '}
                        {rec.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Test Results */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">📋 Test Results</h2>
              <div className="space-y-4">
                {diagnostics.tests.map((test: any, index: number) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        <span className="text-2xl mr-3">{getStatusIcon(test.status)}</span>
                        <div>
                          <h3 className={`font-semibold ${getStatusColor(test.status)}`}>
                            {test.test}
                          </h3>
                          <p className="text-sm text-gray-600">{test.message}</p>
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    {test.details && (
                      <div className="mt-3 pl-11">
                        <details className="text-sm">
                          <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                            View Details
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-auto max-h-60">
                            {JSON.stringify(test.details, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}

                    {/* Error */}
                    {test.error && (
                      <div className="mt-3 pl-11">
                        <div className="p-3 bg-red-50 border border-red-200 rounded">
                          <p className="text-sm text-red-800 font-mono">
                            {JSON.stringify(test.error)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No Results */}
        {!diagnostics && !loading && (
          <div className="bg-white shadow rounded-lg p-12 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-600">
              Select a Tonic account and click "Run Diagnostic" to test API permissions
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
