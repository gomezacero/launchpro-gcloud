'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Settings {
  notificationEmails: string;
  hasAnthropicKey: boolean;
  hasGcpConfig: boolean;
  hasMetaConfig: boolean;
  hasTiktokConfig: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [notificationEmails, setNotificationEmails] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch settings');
      }

      setSettings(result.data);
      setNotificationEmails(result.data.notificationEmails || '');
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationEmails }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to save settings');
      }

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading settings...</p>
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
            Configure global settings for LaunchPro
          </p>
        </div>

        {/* Navigation */}
        <div className="mb-6 flex gap-4">
          <span className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium">
            General
          </span>
          <Link
            href="/settings/accounts"
            className="px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-100 border border-gray-200"
          >
            Accounts
          </Link>
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

        {/* Email Notifications Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">📧</span>
            Email Notifications
          </h2>
          <p className="text-gray-600 mb-4">
            Configure email addresses to receive notifications when campaigns are launched successfully or fail.
          </p>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notification Emails
            </label>
            <input
              type="text"
              value={notificationEmails}
              onChange={(e) => setNotificationEmails(e.target.value)}
              placeholder="manager1@example.com, manager2@example.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="mt-2 text-sm text-gray-500">
              Separate multiple email addresses with commas. Leave empty to disable email notifications.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Configuration Status Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-2xl">🔧</span>
            Configuration Status
          </h2>
          <p className="text-gray-600 mb-4">
            Status of API configurations (set via environment variables or database).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">Anthropic (AI)</span>
              {settings?.hasAnthropicKey ? (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                  Not Set
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">Google Cloud</span>
              {settings?.hasGcpConfig ? (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                  Not Set
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">Meta Ads</span>
              {settings?.hasMetaConfig ? (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                  Not Set
                </span>
              )}
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <span className="font-medium text-gray-700">TikTok Ads</span>
              {settings?.hasTiktokConfig ? (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm font-semibold">
                  Configured
                </span>
              ) : (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm font-semibold">
                  Not Set
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Email Service Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">About Email Notifications</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>
              • <strong>Success Emails:</strong> Sent when a campaign is successfully launched to all platforms
            </li>
            <li>
              • <strong>Failure Emails:</strong> Sent when a campaign fails during the launch process
            </li>
            <li>
              • <strong>Resend API:</strong> Requires RESEND_API_KEY environment variable to be set
            </li>
            <li>
              • <strong>Background Processing:</strong> Campaigns launch in the background, allowing multiple simultaneous launches
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
