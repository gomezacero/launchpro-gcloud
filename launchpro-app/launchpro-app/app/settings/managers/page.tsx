'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

interface Manager {
  id: string;
  name: string;
  email: string;
  role: string;
  lookerReportUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  _count: {
    campaigns: number;
  };
}

export default function ManagersSettingsPage() {
  const router = useRouter();
  const { isSuperAdmin, isLoading: authLoading, isAuthenticated } = useAuth();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Access control - redirect non-SUPERADMIN users
  useEffect(() => {
    if (!authLoading && isAuthenticated && !isSuperAdmin) {
      router.replace('/campaigns');
    }
  }, [authLoading, isAuthenticated, isSuperAdmin, router]);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchManagers();
    }
  }, [isSuperAdmin]);

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/managers');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch managers');
      }

      // Fetch full details including lookerReportUrl for each manager
      const managersWithDetails = await Promise.all(
        result.data.map(async (manager: Manager) => {
          const detailResponse = await fetch(`/api/managers/${manager.id}`);
          const detailResult = await detailResponse.json();
          return detailResult.success ? detailResult.data : manager;
        })
      );

      setManagers(managersWithDetails);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (manager: Manager) => {
    setEditingId(manager.id);
    setEditUrl(manager.lookerReportUrl || '');
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditUrl('');
  };

  const handleSave = async (managerId: string) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/managers/${managerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookerReportUrl: editUrl }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to update manager');
      }

      // Update local state
      setManagers((prev) =>
        prev.map((m) =>
          m.id === managerId ? { ...m, lookerReportUrl: editUrl || null } : m
        )
      );

      setEditingId(null);
      setEditUrl('');
      setSuccess('Looker URL updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Show loading while checking auth or if not SUPERADMIN
  if (authLoading || !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Checking permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading managers...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">
            Configure Looker Studio reports for managers
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
          <Link
            href="/settings/accounts"
            className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-100 border border-gray-200"
          >
            Accounts
          </Link>
          <span className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
            Managers
          </span>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error}</p>
          </div>
        )}

        {/* Success Alert */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {/* Managers List */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-2xl">📊</span>
              Looker Studio Reports
            </h2>
            <p className="text-gray-600 mt-1">
              Assign Looker Studio report URLs to each manager. They will see their report in the Analytics page.
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {managers.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                No managers found
              </div>
            ) : (
              managers.map((manager) => (
                <div key={manager.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
                          {manager.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{manager.name}</h3>
                          <p className="text-sm text-gray-500">{manager.email}</p>
                        </div>
                      </div>

                      {editingId === manager.id ? (
                        <div className="mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Looker Studio Embed URL
                          </label>
                          <input
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            placeholder="https://lookerstudio.google.com/embed/reporting/..."
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">
                            Use the embed URL from Looker Studio (Archivo → Insertar informe → Insertar URL)
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleSave(manager.id)}
                              disabled={saving}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={handleCancel}
                              disabled={saving}
                              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          {manager.lookerReportUrl ? (
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                                Configured
                              </span>
                              <span className="text-sm text-gray-500 truncate max-w-md">
                                {manager.lookerReportUrl}
                              </span>
                            </div>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                              Not configured
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {editingId !== manager.id && (
                      <button
                        onClick={() => handleEdit(manager)}
                        className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg text-sm font-medium"
                      >
                        {manager.lookerReportUrl ? 'Edit' : 'Configure'}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">How to get the Embed URL</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Open the manager's report in Looker Studio</li>
            <li>Click "Editar" (Edit) to enter edit mode</li>
            <li>Go to Archivo (File) → Insertar informe (Embed report)</li>
            <li>Check "Habilitar insercion" (Enable embedding)</li>
            <li>Select "Insertar URL" and copy the URL</li>
            <li>Paste the URL here</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
