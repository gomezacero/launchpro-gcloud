'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Account, AccountType } from '@prisma/client';

interface AccountWithStatus extends Account {
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts');
      if (!response.ok) throw new Error('Failed to fetch accounts');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch accounts');
      }

      // Flatten the grouped accounts into a single array
      const allAccounts = [
        ...(result.data.tonic || []),
        ...(result.data.meta?.all || []),
        ...(result.data.tiktok || []),
      ];

      setAccounts(allAccounts);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleRefreshPixels = async (accountId: string) => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/accounts/${accountId}/pixels/refresh`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to refresh pixels');
      }

      const result = await response.json();
      alert(`Success! Pixel ID: ${result.pixelId}`);

      // Refresh the accounts list
      await fetchAccounts();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  const getStatusBadge = (status: 'healthy' | 'warning' | 'error') => {
    const styles = {
      healthy: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
    };

    const icons = {
      healthy: '✓',
      warning: '⚠',
      error: '✗',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${styles[status]}`}>
        {icons[status]} {status.toUpperCase()}
      </span>
    );
  };

  const getAccountTypeColor = (type: AccountType) => {
    const colors: Record<AccountType, string> = {
      TONIC: 'bg-blue-100 text-blue-800',
      META: 'bg-purple-100 text-purple-800',
      TIKTOK: 'bg-pink-100 text-pink-800',
      TABOOLA: 'bg-orange-100 text-orange-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading accounts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Manage your Tonic, Meta, and TikTok advertising accounts
          </p>
        </div>

        {/* Navigation */}
        <div className="mb-6 flex gap-4">
          <Link
            href="/settings"
            className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-100 border border-gray-200"
          >
            General
          </Link>
          <span className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
            Accounts
          </span>
          <Link
            href="/settings/managers"
            className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-100 border border-gray-200"
          >
            Managers
          </Link>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {/* Accounts by Type */}
        {['TONIC', 'META', 'TIKTOK'].map((accountType) => {
          const typeAccounts = accounts.filter(
            (acc) => acc.accountType === accountType
          );

          if (typeAccounts.length === 0) return null;

          return (
            <div key={accountType} className="mb-8">
              <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold mr-3 ${getAccountTypeColor(
                    accountType as AccountType
                  )}`}
                >
                  {accountType}
                </span>
                <span className="text-gray-500 text-sm font-normal">
                  {typeAccounts.length} account(s)
                </span>
              </h2>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Account Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        {accountType === 'TONIC' && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              API Key
                            </th>
                          </>
                        )}
                        {accountType === 'META' && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Ad Account ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Pixel ID
                            </th>
                          </>
                        )}
                        {accountType === 'TIKTOK' && (
                          <>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Advertiser ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Pixel ID
                            </th>
                          </>
                        )}
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Issues
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {typeAccounts.map((account) => (
                        <tr key={account.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-medium text-gray-900">
                              {account.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(account.status)}
                          </td>

                          {/* TONIC Columns */}
                          {accountType === 'TONIC' && (
                            <>
                              <td className="px-6 py-4">
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {account.tonicConsumerKey
                                    ? `${account.tonicConsumerKey.slice(0, 8)}...`
                                    : 'Not configured'}
                                </code>
                              </td>
                            </>
                          )}

                          {/* META Columns */}
                          {accountType === 'META' && (
                            <>
                              <td className="px-6 py-4">
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {account.metaAdAccountId || 'Not configured'}
                                </code>
                              </td>
                              <td className="px-6 py-4">
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {account.metaPixelId || 'Not configured'}
                                </code>
                              </td>
                            </>
                          )}

                          {/* TIKTOK Columns */}
                          {accountType === 'TIKTOK' && (
                            <>
                              <td className="px-6 py-4">
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                  {account.tiktokAdvertiserId || 'Not configured'}
                                </code>
                              </td>
                              <td className="px-6 py-4">
                                {account.tiktokPixelId ? (
                                  <code className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-semibold">
                                    {account.tiktokPixelId}
                                  </code>
                                ) : (
                                  <span className="text-xs text-red-600 font-semibold">
                                    Not configured
                                  </span>
                                )}
                              </td>
                            </>
                          )}

                          <td className="px-6 py-4">
                            {account.issues.length > 0 ? (
                              <div className="text-xs text-gray-600">
                                {account.issues.map((issue, idx) => (
                                  <div key={idx} className="mb-1">
                                    • {issue}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">None</span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            {accountType === 'TIKTOK' && !account.tiktokPixelId && (
                              <button
                                onClick={() => handleRefreshPixels(account.id)}
                                disabled={refreshing}
                                className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {refreshing ? 'Refreshing...' : 'Auto-fetch Pixel'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })}

        {/* Summary */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">About Account Management</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <strong>Auto-fetch Pixel:</strong> Automatically retrieves pixel IDs from TikTok API
            </li>
            <li>
              • <strong>Status Indicators:</strong> Shows configuration health for each account
            </li>
            <li>
              • <strong>Campaign Launch:</strong> Pixel IDs are also auto-fetched during campaign creation if missing
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
