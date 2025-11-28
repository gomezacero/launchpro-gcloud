'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface Campaign {
  id: string;
  name: string;
  status: string;
  campaignType: string;
  country: string;
  language: string;
  copyMaster: string | null;
  communicationAngle: string | null;
  keywords: string[];
  tonicCampaignId: string | null;
  tonicTrackingLink: string | null;
  createdAt: string;
  updatedAt: string;
  launchedAt: string | null;
  errorDetails?: {
    step: string;
    message: string;
    timestamp: string;
    platform?: string;
    technicalDetails?: string;
  };
  offer: {
    name: string;
    vertical: string;
  };
  platforms: {
    platform: string;
    status: string;
    budget: number;
    metaCampaignId: string | null;
    metaAdSetId: string | null;
    metaAdId: string | null;
    tiktokCampaignId: string | null;
    tiktokAdGroupId: string | null;
    tiktokAdId: string | null;
  }[];
  media: {
    id: string;
    type: string;
    url: string;
    fileName: string;
    generatedByAI: boolean;
  }[];
}

export default function CampaignDetailPage() {
  const params = useParams();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  useEffect(() => {
    async function fetchCampaign() {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}`);
        const data = await res.json();

        if (!data.success) {
          setError(data.error || 'Failed to fetch campaign');
          return;
        }

        setCampaign(data.data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCampaign();
  }, [campaignId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading campaign details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
          <Link
            href="/campaigns"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Campaign Not Found
          </h2>
          <p className="text-gray-700 mb-4">
            The campaign with ID {campaignId} was not found.
          </p>
          <Link
            href="/campaigns"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            Back to Campaigns
          </Link>
        </div>
      </div>
    );
  }

  const statusColor =
    campaign.status === 'ACTIVE'
      ? 'bg-green-100 text-green-800'
      : campaign.status === 'FAILED'
        ? 'bg-red-100 text-red-800'
        : campaign.status === 'DRAFT'
          ? 'bg-gray-100 text-gray-800'
          : 'bg-yellow-100 text-yellow-800';

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {campaign.name}
              </h1>
              <p className="text-gray-600 mt-1">
                {campaign.offer.name} | {campaign.country} | {campaign.language}
              </p>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-semibold ${statusColor}`}
            >
              {campaign.status}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">Campaign Type</p>
              <p className="font-semibold">{campaign.campaignType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="font-semibold">
                {new Date(campaign.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Launched</p>
              <p className="font-semibold">
                {campaign.launchedAt
                  ? new Date(campaign.launchedAt).toLocaleDateString()
                  : 'Not launched'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Vertical</p>
              <p className="font-semibold">{campaign.offer.vertical}</p>
            </div>
          </div>
        </div>

        {/* Error Details Section - Only shown when campaign failed */}
        {campaign.status === 'FAILED' && campaign.errorDetails && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-red-800 mb-4 flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              Error en la Campaña
            </h2>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-red-600 font-medium min-w-[100px]">Paso:</span>
                <span className="text-red-800">{campaign.errorDetails.step}</span>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-red-600 font-medium min-w-[100px]">Mensaje:</span>
                <span className="text-red-800">{campaign.errorDetails.message}</span>
              </div>

              {campaign.errorDetails.platform && (
                <div className="flex items-start gap-3">
                  <span className="text-red-600 font-medium min-w-[100px]">Plataforma:</span>
                  <span className="text-red-800">{campaign.errorDetails.platform}</span>
                </div>
              )}

              <div className="flex items-start gap-3">
                <span className="text-red-600 font-medium min-w-[100px]">Fecha:</span>
                <span className="text-red-800">
                  {new Date(campaign.errorDetails.timestamp).toLocaleString()}
                </span>
              </div>

              {campaign.errorDetails.technicalDetails && (
                <div className="mt-4 pt-4 border-t border-red-200">
                  <button
                    onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                    className="text-red-700 hover:text-red-900 font-medium flex items-center gap-2"
                  >
                    <span>{showTechnicalDetails ? '▼' : '▶'}</span>
                    {showTechnicalDetails ? 'Ocultar' : 'Mostrar'} detalles técnicos
                  </button>

                  {showTechnicalDetails && (
                    <pre className="mt-3 p-4 bg-red-100 rounded-lg text-xs text-red-900 overflow-x-auto whitespace-pre-wrap font-mono">
                      {campaign.errorDetails.technicalDetails}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tonic Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Tonic Integration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Tonic Campaign ID</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded">
                {campaign.tonicCampaignId || 'Not created'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tracking Link</p>
              <p className="font-mono text-xs bg-gray-100 p-2 rounded break-all">
                {campaign.tonicTrackingLink || 'Not available'}
              </p>
            </div>
          </div>
        </div>

        {/* Platforms */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Platform Status
          </h2>
          <div className="space-y-4">
            {campaign.platforms.map((platform) => (
              <div
                key={platform.platform}
                className="border rounded-lg p-4"
              >
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">
                    {platform.platform === 'META'
                      ? 'Meta (Facebook/Instagram)'
                      : 'TikTok'}
                  </h3>
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      platform.status === 'ACTIVE'
                        ? 'bg-green-100 text-green-800'
                        : platform.status === 'FAILED'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {platform.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p className="text-gray-500">Budget</p>
                    <p className="font-semibold">${platform.budget}</p>
                  </div>
                  {platform.platform === 'META' && (
                    <>
                      <div>
                        <p className="text-gray-500">Campaign ID</p>
                        <p className="font-mono text-xs">
                          {platform.metaCampaignId || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ad Set ID</p>
                        <p className="font-mono text-xs">
                          {platform.metaAdSetId || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ad ID</p>
                        <p className="font-mono text-xs">
                          {platform.metaAdId || '-'}
                        </p>
                      </div>
                    </>
                  )}
                  {platform.platform === 'TIKTOK' && (
                    <>
                      <div>
                        <p className="text-gray-500">Campaign ID</p>
                        <p className="font-mono text-xs">
                          {platform.tiktokCampaignId || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ad Group ID</p>
                        <p className="font-mono text-xs">
                          {platform.tiktokAdGroupId || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-500">Ad ID</p>
                        <p className="font-mono text-xs">
                          {platform.tiktokAdId || '-'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Keywords */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Keywords</h2>
          <div className="flex flex-wrap gap-2">
            {campaign.keywords.map((keyword, index) => (
              <span
                key={index}
                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>

        {/* Media */}
        {campaign.media.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Media</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaign.media.map((media) => (
                <div key={media.id} className="border rounded-lg p-3">
                  <p className="text-sm font-semibold mb-2">
                    {media.fileName}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    Type: {media.type} |{' '}
                    {media.generatedByAI ? 'AI Generated' : 'Manual Upload'}
                  </p>
                  {media.type === 'IMAGE' ? (
                    <img
                      src={media.url}
                      alt={media.fileName}
                      className="w-full h-40 object-cover rounded"
                    />
                  ) : (
                    <video
                      src={media.url}
                      controls
                      className="w-full h-40 rounded"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Copy Master */}
        {campaign.copyMaster && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Copy Master
            </h2>
            <p className="text-gray-700 whitespace-pre-wrap">
              {campaign.copyMaster}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Link
            href="/campaigns"
            className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Back to Campaigns
          </Link>
          <Link
            href="/campaigns/new"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Create New Campaign
          </Link>
        </div>
      </div>
    </div>
  );
}
