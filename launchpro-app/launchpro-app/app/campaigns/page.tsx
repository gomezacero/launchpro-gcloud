'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  country: string;
  createdAt: string;
  launchedAt?: string;
  offer: {
    name: string;
    vertical: string;
  };
  platforms: Array<{
    platform: string;
    budget: number;
    status: string;
  }>;
  media: Array<{
    type: string;
    url: string;
  }>;
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING_ARTICLE: 'bg-amber-100 text-amber-800',
  ARTICLE_APPROVED: 'bg-cyan-100 text-cyan-800',
  GENERATING_AI: 'bg-purple-100 text-purple-800',
  READY_TO_LAUNCH: 'bg-blue-100 text-blue-800',
  LAUNCHING: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  PAUSED: 'bg-orange-100 text-orange-800',
  COMPLETED: 'bg-gray-100 text-gray-800',
  FAILED: 'bg-red-100 text-red-800',
};

const statusIcons: Record<string, string> = {
  DRAFT: '📝',
  PENDING_ARTICLE: '⏳',
  ARTICLE_APPROVED: '✓',
  GENERATING_AI: '🤖',
  READY_TO_LAUNCH: '🎯',
  LAUNCHING: '🚀',
  ACTIVE: '✅',
  PAUSED: '⏸️',
  COMPLETED: '🏁',
  FAILED: '❌',
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadCampaigns();
  }, [filter]);

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const url =
        filter === 'all' ? '/api/campaigns' : `/api/campaigns?status=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCampaigns(data.data);
      }
    } catch (error) {
      console.error('Error loading campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-3xl hover:scale-110 transition-transform">
                🚀
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">All Campaigns</h1>
            </div>
            <Link
              href="/campaigns/new"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              + New Campaign
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {[
              'all',
              'PENDING_ARTICLE',
              'ARTICLE_APPROVED',
              'GENERATING_AI',
              'LAUNCHING',
              'ACTIVE',
              'FAILED',
            ].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? 'All' : status.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading campaigns...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && campaigns.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No campaigns found
            </h3>
            <p className="text-gray-600 mb-6">
              {filter === 'all'
                ? "You haven't created any campaigns yet."
                : `No campaigns with status: ${filter}`}
            </p>
            <Link
              href="/campaigns/new"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Create Your First Campaign
            </Link>
          </div>
        )}

        {/* Campaigns Grid */}
        {!loading && campaigns.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/campaigns/${campaign.id}`}
                className="block bg-white rounded-lg shadow hover:shadow-xl transition-shadow overflow-hidden"
              >
                {/* Campaign Header */}
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-1">
                        {campaign.name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {campaign.offer.name}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        statusColors[campaign.status]
                      }`}
                    >
                      {statusIcons[campaign.status]}{' '}
                      {campaign.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Campaign Info */}
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>📊</span>
                      <span>{campaign.campaignType}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>🌍</span>
                      <span>{campaign.country}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>📅</span>
                      <span>
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Platforms */}
                  <div className="flex gap-2 mb-4">
                    {campaign.platforms.map((platform, index) => (
                      <div
                        key={index}
                        className="px-3 py-1 bg-gray-100 rounded-full text-xs font-medium"
                      >
                        {platform.platform === 'META' ? '📘' : '🎵'}{' '}
                        {platform.platform}
                      </div>
                    ))}
                  </div>

                  {/* Media Preview */}
                  {campaign.media.length > 0 && (
                    <div className="flex gap-2">
                      {campaign.media.slice(0, 3).map((media, index) => (
                        <div
                          key={index}
                          className="w-16 h-16 bg-gray-200 rounded overflow-hidden"
                        >
                          {media.type === 'IMAGE' ? (
                            <img
                              src={media.url}
                              alt="Campaign media"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">
                              🎥
                            </div>
                          )}
                        </div>
                      ))}
                      {campaign.media.length > 3 && (
                        <div className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center text-xs font-medium text-gray-600">
                          +{campaign.media.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Campaign Footer */}
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">View Details</span>
                    <span className="text-blue-600">→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
