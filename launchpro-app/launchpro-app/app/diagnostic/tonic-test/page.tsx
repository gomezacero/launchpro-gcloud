'use client';

import { useState } from 'react';

export default function TonicTestPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostic = async () => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch('/api/diagnostic/tonic-test');
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to run diagnostic');
      }

      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      SUCCESS: { bg: 'bg-green-100', text: 'text-green-800', label: '✅ Success' },
      ERROR: { bg: 'bg-red-100', text: 'text-red-800', label: '❌ Error' },
      INFO: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'ℹ️ Info' },
      HEALTHY: { bg: 'bg-green-100', text: 'text-green-800', label: '💚 Healthy' },
    };

    const badge = badges[status] || badges.INFO;
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">
            🔍 Tonic Accounts Diagnostic
          </h1>
          <p className="text-lg text-gray-600">
            Comprehensive test of all Tonic accounts to detect RSOC and Display capabilities
          </p>
        </div>

        {/* Run Button */}
        <div className="bg-white shadow-lg rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-1">
                Test All Tonic Accounts
              </h2>
              <p className="text-sm text-gray-600">
                This will test authentication, RSOC support, Display support, and available offers for each account
              </p>
            </div>

            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2 transition-all shadow-md hover:shadow-lg"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Testing...
                </>
              ) : (
                <>
                  <span>▶️</span>
                  Run Diagnostic
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-8 rounded-r-lg">
            <div className="flex items-center">
              <div className="text-red-500 text-2xl mr-3">⚠️</div>
              <div>
                <h3 className="font-semibold text-red-800 mb-1">Error Running Diagnostic</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Overall Summary */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4">📊 Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-3xl font-bold">{results.summary.totalAccounts}</div>
                  <div className="text-sm opacity-90">Total Accounts</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-3xl font-bold">{results.summary.healthyAccounts}</div>
                  <div className="text-sm opacity-90">Healthy</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-3xl font-bold">{results.summary.rsocCapableAccounts}</div>
                  <div className="text-sm opacity-90">RSOC-Capable</div>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-lg p-4">
                  <div className="text-3xl font-bold">{results.summary.displayCapableAccounts}</div>
                  <div className="text-sm opacity-90">Display-Capable</div>
                </div>
              </div>
            </div>

            {/* Recommendations */}
            <div className="bg-white shadow-lg rounded-xl p-6">
              <h2 className="text-2xl font-bold mb-4 text-gray-900">💡 Recommendations</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="font-semibold text-purple-900 mb-1">For RSOC Campaigns</div>
                  <div className="text-purple-700">{results.summary.recommendations.forRSOC}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="font-semibold text-blue-900 mb-1">For Display Campaigns</div>
                  <div className="text-blue-700">{results.summary.recommendations.forDisplay}</div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <div className="font-semibold text-indigo-900 mb-1">For Meta Campaigns</div>
                  <div className="text-indigo-700">{results.summary.recommendations.forMeta}</div>
                </div>
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <div className="font-semibold text-pink-900 mb-1">For TikTok Campaigns</div>
                  <div className="text-pink-700">{results.summary.recommendations.forTikTok}</div>
                </div>
              </div>
            </div>

            {/* Account Results */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-900">📋 Account Details</h2>

              {results.results.map((account: any, index: number) => (
                <div key={index} className="bg-white shadow-lg rounded-xl overflow-hidden">
                  {/* Account Header */}
                  <div className="bg-gradient-to-r from-gray-700 to-gray-800 text-white p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-2xl font-bold mb-1">{account.accountName}</h3>
                        <p className="text-gray-300 text-sm font-mono">{account.consumerKey}</p>
                      </div>
                      <div>
                        {getStatusBadge(account.summary?.overallStatus)}
                      </div>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="p-6 border-b bg-gray-50">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className={`p-4 rounded-lg ${account.summary?.canCreateRSOC ? 'bg-green-100 border border-green-300' : 'bg-gray-100 border border-gray-300'}`}>
                        <div className="text-sm font-semibold text-gray-700 mb-1">RSOC Support</div>
                        <div className={`text-lg font-bold ${account.summary?.canCreateRSOC ? 'text-green-700' : 'text-gray-500'}`}>
                          {account.summary?.canCreateRSOC ? '✅ Yes' : '❌ No'}
                        </div>
                      </div>
                      <div className={`p-4 rounded-lg ${account.summary?.canCreateDisplay ? 'bg-blue-100 border border-blue-300' : 'bg-gray-100 border border-gray-300'}`}>
                        <div className="text-sm font-semibold text-gray-700 mb-1">Display Support</div>
                        <div className={`text-lg font-bold ${account.summary?.canCreateDisplay ? 'text-blue-700' : 'text-gray-500'}`}>
                          {account.summary?.canCreateDisplay ? '✅ Yes' : '❌ No'}
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-purple-100 border border-purple-300">
                        <div className="text-sm font-semibold text-gray-700 mb-1">Recommendation</div>
                        <div className="text-sm text-purple-800 font-medium">
                          {account.summary?.recommendation}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Test Results */}
                  <div className="p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">Test Results</h4>
                    <div className="space-y-3">
                      {Object.entries(account.tests || {}).map(([testName, testData]: [string, any]) => (
                        <div key={testName} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {getStatusBadge(testData.status)}
                                <span className="font-semibold text-gray-900 capitalize">
                                  {testName.replace(/([A-Z])/g, ' $1').trim()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">{testData.message}</p>

                              {/* Additional Info */}
                              {testData.supported !== undefined && (
                                <div className="mt-2 text-sm">
                                  <span className={`font-medium ${testData.supported ? 'text-green-600' : 'text-gray-500'}`}>
                                    Supported: {testData.supported ? 'Yes' : 'No'}
                                  </span>
                                </div>
                              )}

                              {/* Domains Info */}
                              {testData.domains && testData.domains.length > 0 && (
                                <div className="mt-2">
                                  <details className="text-sm">
                                    <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                                      View Domains ({testData.domainsCount})
                                    </summary>
                                    <div className="mt-2 pl-4 space-y-1">
                                      {testData.domains.map((domain: any, i: number) => (
                                        <div key={i} className="text-gray-700">
                                          <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                            {domain.domain}
                                          </span>
                                          {domain.languages && (
                                            <span className="ml-2 text-xs text-gray-500">
                                              Languages: {domain.languages.join(', ')}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                </div>
                              )}

                              {/* Offers Info */}
                              {testData.sampleOffers && testData.sampleOffers.length > 0 && (
                                <div className="mt-2">
                                  <details className="text-sm">
                                    <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                                      View Sample Offers ({testData.offersCount} total)
                                    </summary>
                                    <div className="mt-2 pl-4 space-y-1">
                                      {testData.sampleOffers.map((offer: any, i: number) => (
                                        <div key={i} className="text-gray-700 text-xs">
                                          <span className="font-medium">{offer.name}</span>
                                          <span className="ml-2 text-gray-500">(ID: {offer.id})</span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                </div>
                              )}

                              {/* Campaigns Info */}
                              {testData.sampleCampaigns && testData.sampleCampaigns.length > 0 && (
                                <div className="mt-2">
                                  <details className="text-sm">
                                    <summary className="cursor-pointer text-blue-600 hover:text-blue-700 font-medium">
                                      View Sample Campaigns ({testData.campaignsCount} total)
                                    </summary>
                                    <div className="mt-2 pl-4 space-y-1">
                                      {testData.sampleCampaigns.map((campaign: any, i: number) => (
                                        <div key={i} className="text-gray-700 text-xs">
                                          <span className="font-medium">{campaign.name}</span>
                                          <span className="ml-2 text-gray-500">
                                            ({campaign.type} - {campaign.country})
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                </div>
                              )}

                              {/* Error */}
                              {testData.error && (
                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                                  <span className="text-red-700 font-mono">{testData.error}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Timestamp */}
            <div className="text-center text-sm text-gray-500">
              Tested at: {new Date(results.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        {/* No Results */}
        {!results && !loading && !error && (
          <div className="bg-white shadow-lg rounded-xl p-16 text-center">
            <div className="text-8xl mb-6">🔍</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Ready to Test Tonic Accounts
            </h3>
            <p className="text-gray-600 mb-6">
              Click the "Run Diagnostic" button above to test all Tonic accounts and see their capabilities
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-2xl mx-auto">
              <p className="text-sm text-blue-900">
                <strong>What this test does:</strong><br />
                ✓ Validates authentication credentials<br />
                ✓ Checks RSOC support and available domains<br />
                ✓ Checks Display campaign support<br />
                ✓ Lists available offers and existing campaigns<br />
                ✓ Provides recommendations for each platform
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
