'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

// Mapeo de pasos técnicos a nombres amigables
const STEP_NAMES: Record<string, { name: string; icon: string; description: string }> = {
  'validation': { name: 'Validación', icon: '✓', description: 'Verificando configuración de la campaña' },
  'tonic_article': { name: 'Artículo Tonic', icon: '📝', description: 'Creando artículo RSOC en Tonic' },
  'tonic_approval': { name: 'Aprobación Tonic', icon: '⏳', description: 'Esperando aprobación del artículo' },
  'tonic_campaign': { name: 'Campaña Tonic', icon: '🎯', description: 'Creando campaña en Tonic' },
  'tracking_link': { name: 'Tracking Link', icon: '🔗', description: 'Obteniendo enlace de seguimiento' },
  'keywords': { name: 'Keywords', icon: '🏷️', description: 'Configurando palabras clave' },
  'pixel_meta': { name: 'Pixel Meta', icon: '📊', description: 'Configurando pixel de Meta' },
  'pixel_tiktok': { name: 'Pixel TikTok', icon: '📊', description: 'Configurando pixel de TikTok' },
  'meta_campaign': { name: 'Campaña Meta', icon: '📘', description: 'Creando campaña en Meta' },
  'meta_adset': { name: 'Ad Set Meta', icon: '📘', description: 'Creando conjunto de anuncios en Meta' },
  'meta_media': { name: 'Media Meta', icon: '🖼️', description: 'Subiendo media a Meta' },
  'meta_ad': { name: 'Anuncio Meta', icon: '📘', description: 'Creando anuncio en Meta' },
  'tiktok_campaign': { name: 'Campaña TikTok', icon: '🎵', description: 'Creando campaña en TikTok' },
  'tiktok_video': { name: 'Video TikTok', icon: '🎬', description: 'Subiendo video a TikTok' },
  'tiktok_ad': { name: 'Anuncio TikTok', icon: '🎵', description: 'Creando anuncio en TikTok' },
  'platform-launch': { name: 'Lanzamiento a Plataforma', icon: '🚀', description: 'Enviando campaña a plataformas de ads' },
  'launch': { name: 'Lanzamiento', icon: '🚀', description: 'Proceso de lanzamiento de campaña' },
  'complete': { name: 'Completado', icon: '✅', description: 'Campaña lanzada exitosamente' },
  'error': { name: 'Error', icon: '❌', description: 'Error durante el lanzamiento' },
};

// Función para obtener sugerencias basadas en el error
function getErrorSuggestion(step: string, message: string): string | null {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('token') || lowerMessage.includes('access')) {
    return 'Verifica que los tokens de acceso estén vigentes. Puede ser necesario re-autenticar la cuenta.';
  }
  if (lowerMessage.includes('permission') || lowerMessage.includes('forbidden')) {
    return 'La cuenta no tiene permisos suficientes. Verifica los permisos de la aplicación.';
  }
  if (lowerMessage.includes('budget') || lowerMessage.includes('presupuesto')) {
    return 'Verifica que el presupuesto cumpla con los mínimos requeridos por la plataforma.';
  }
  if (lowerMessage.includes('pixel')) {
    return 'Verifica que el Pixel ID esté correctamente configurado en la cuenta.';
  }
  if (lowerMessage.includes('image') || lowerMessage.includes('video') || lowerMessage.includes('media')) {
    return 'Hubo un problema con los archivos multimedia. Verifica el formato y tamaño de los archivos.';
  }
  if (lowerMessage.includes('location id not found') || lowerMessage.includes('country code')) {
    return 'El país seleccionado no está disponible para la cuenta de TikTok asignada. Verifica que estés usando la cuenta TikTok correcta (TG para Latam, TY para países anglo).';
  }
  if (lowerMessage.includes('advertiser') && lowerMessage.includes('not found')) {
    return 'El Advertiser ID de TikTok no es válido. Verifica la configuración de la cuenta en Settings.';
  }
  if (step.includes('tonic')) {
    return 'Error relacionado con Tonic. Verifica las credenciales y que la oferta esté activa.';
  }

  return null;
}

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
  designFlowTask?: {
    id: string;
    designflowTaskId: string;
    status: string;
    title: string;
    requester: string;
    sentAt: string;
    completedAt: string | null;
    deliveryLink: string | null;
  };
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // Función para ir al wizard con los datos precargados
  const handleReconfigure = () => {
    router.push(`/campaigns/new?clone=${campaignId}`);
  };

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
          : campaign.status === 'AWAITING_DESIGN'
            ? 'bg-purple-100 text-purple-800'
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
              <p className="text-sm text-gray-600 font-medium">Campaign Type</p>
              <p className="font-semibold text-gray-900">{campaign.campaignType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Created</p>
              <p className="font-semibold text-gray-900">
                {new Date(campaign.createdAt).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Launched</p>
              <p className="font-semibold text-gray-900">
                {campaign.launchedAt
                  ? new Date(campaign.launchedAt).toLocaleDateString()
                  : 'Not launched'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-medium">Vertical</p>
              <p className="font-semibold text-gray-900">{campaign.offer.vertical}</p>
            </div>
          </div>
        </div>

        {/* Error Details Section - Only shown when campaign failed */}
        {campaign.status === 'FAILED' && campaign.errorDetails && (
          <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 mb-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-red-800 flex items-center gap-2">
                <span className="text-2xl">❌</span>
                Error en el Lanzamiento
              </h2>
              <button
                onClick={handleReconfigure}
                className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                <span>🔄</span>
                Volver a Configurar
              </button>
            </div>

            {/* Paso donde falló */}
            <div className="bg-white border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">
                  {STEP_NAMES[campaign.errorDetails.step]?.icon || '❓'}
                </span>
                <div>
                  <p className="font-semibold text-red-800">
                    Falló en: {STEP_NAMES[campaign.errorDetails.step]?.name || campaign.errorDetails.step}
                  </p>
                  <p className="text-sm text-red-600">
                    {STEP_NAMES[campaign.errorDetails.step]?.description || 'Paso del proceso'}
                  </p>
                </div>
                {campaign.errorDetails.platform && (
                  <span className="ml-auto bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                    {campaign.errorDetails.platform}
                  </span>
                )}
              </div>
            </div>

            {/* Mensaje de error */}
            <div className="bg-red-100 border-l-4 border-red-500 p-4 mb-4">
              <p className="font-medium text-red-800 mb-1">Mensaje de Error:</p>
              <p className="text-red-700">{campaign.errorDetails.message}</p>
            </div>

            {/* Sugerencia de solución */}
            {getErrorSuggestion(campaign.errorDetails.step, campaign.errorDetails.message) && (
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                <p className="font-medium text-yellow-800 mb-1">💡 Sugerencia:</p>
                <p className="text-yellow-700">
                  {getErrorSuggestion(campaign.errorDetails.step, campaign.errorDetails.message)}
                </p>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-sm text-red-600 mb-4">
              <span className="font-medium">Fecha del error:</span>{' '}
              {new Date(campaign.errorDetails.timestamp).toLocaleString('es-ES', {
                dateStyle: 'medium',
                timeStyle: 'medium'
              })}
            </div>

            {/* Detalles técnicos */}
            {campaign.errorDetails.technicalDetails && (
              <div className="border-t border-red-200 pt-4">
                <button
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="text-red-700 hover:text-red-900 font-medium flex items-center gap-2 mb-3"
                >
                  <span className="text-lg">{showTechnicalDetails ? '▼' : '▶'}</span>
                  {showTechnicalDetails ? 'Ocultar' : 'Ver'} detalles técnicos (para desarrolladores)
                </button>

                {showTechnicalDetails && (
                  <pre className="p-4 bg-gray-900 text-green-400 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap font-mono max-h-96 overflow-y-auto">
                    {campaign.errorDetails.technicalDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {/* Launching Status - Shown when campaign is being processed */}
        {campaign.status === 'LAUNCHING' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="animate-spin text-3xl">⚙️</div>
              <div>
                <h2 className="text-xl font-bold text-blue-800">
                  Campaña en Proceso de Lanzamiento
                </h2>
                <p className="text-blue-700 mt-1">
                  Tu campaña se está lanzando en segundo plano. Recibirás una notificación por email cuando esté lista.
                </p>
                <p className="text-blue-600 text-sm mt-2">
                  Puedes cerrar esta página - el proceso continuará automáticamente.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* DesignFlow Status - Shown when campaign is awaiting design */}
        {(campaign.status === 'AWAITING_DESIGN' || campaign.designFlowTask) && campaign.designFlowTask && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-purple-800 flex items-center gap-2">
                <span className="text-2xl">🎨</span>
                Estado de DesignFlow
              </h2>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                campaign.designFlowTask.status === 'Done'
                  ? 'bg-green-100 text-green-800'
                  : campaign.designFlowTask.status === 'In Progress'
                    ? 'bg-blue-100 text-blue-800'
                    : campaign.designFlowTask.status === 'Review'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-purple-100 text-purple-800'
              }`}>
                {campaign.designFlowTask.status}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm text-purple-600 font-medium">Tarea</p>
                <p className="font-semibold text-purple-900">{campaign.designFlowTask.title}</p>
              </div>
              <div>
                <p className="text-sm text-purple-600 font-medium">Solicitante</p>
                <p className="font-semibold text-purple-900">{campaign.designFlowTask.requester}</p>
              </div>
              <div>
                <p className="text-sm text-purple-600 font-medium">Enviado</p>
                <p className="font-semibold text-purple-900">
                  {new Date(campaign.designFlowTask.sentAt).toLocaleDateString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-purple-600 font-medium">Completado</p>
                <p className="font-semibold text-purple-900">
                  {campaign.designFlowTask.completedAt
                    ? new Date(campaign.designFlowTask.completedAt).toLocaleDateString()
                    : 'Pendiente'}
                </p>
              </div>
            </div>

            {campaign.designFlowTask.status === 'Done' && (
              <div className="bg-green-100 border border-green-300 rounded-lg p-4">
                <p className="text-green-800 font-medium mb-2">
                  🎉 ¡Diseño completado!
                </p>
                <p className="text-green-700 text-sm mb-4">
                  El equipo de diseño ha terminado. Puedes continuar con la edición de tu campaña para agregar los assets y lanzar.
                </p>
                <div className="flex flex-wrap gap-3">
                  {campaign.designFlowTask.deliveryLink && (
                    <a
                      href={campaign.designFlowTask.deliveryLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white text-green-700 hover:bg-green-50 border border-green-400 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                    >
                      <span>📎</span>
                      Ver Entregables
                    </a>
                  )}
                  <Link
                    href={`/campaigns/${campaignId}/edit`}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                  >
                    <span>✏️</span>
                    Continuar Edición
                  </Link>
                </div>
              </div>
            )}

            {campaign.designFlowTask.status !== 'Done' && (
              <div className="bg-purple-100 border border-purple-300 rounded-lg p-4">
                <p className="text-purple-800 text-sm">
                  El equipo de diseño está trabajando en esta campaña. Recibirás una notificación cuando los assets estén listos.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tonic Info */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Tonic Integration
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm font-medium text-blue-600">Tonic Campaign ID</p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded text-gray-800">
                {campaign.tonicCampaignId || 'Not created'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-blue-600">Tracking Link (Base)</p>
              <p className="font-mono text-xs bg-gray-100 p-2 rounded break-all text-gray-800">
                {campaign.tonicTrackingLink || 'Not available'}
              </p>
            </div>
          </div>

          {/* Parameterized Tracking Links */}
          {campaign.tonicTrackingLink && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-gray-700 mb-3">Links Parametrizados (usados en ads):</p>
              <div className="space-y-3">
                {/* Meta Link */}
                {campaign.platforms.some(p => p.platform === 'META') && (
                  <div>
                    <p className="text-xs font-medium text-blue-600 mb-1">Meta (Facebook/Instagram):</p>
                    <p className="font-mono text-xs bg-blue-50 p-2 rounded break-all text-gray-800 border border-blue-200">
                      {(() => {
                        try {
                          const url = new URL(campaign.tonicTrackingLink);
                          url.searchParams.set('network', 'facebook');
                          url.searchParams.set('site', 'direct');
                          if (campaign.copyMaster) {
                            url.searchParams.set('adtitle', campaign.copyMaster.substring(0, 100).trim().replace(/\n/g, ' ').replace(/\s+/g, ' '));
                          }
                          url.searchParams.set('ad_id', '{{ad.id}}');
                          url.searchParams.set('dpco', '1');
                          // Decode to show readable URL ({{ad.id}} instead of %7B%7Bad.id%7D%7D)
                          return decodeURIComponent(url.toString());
                        } catch {
                          return campaign.tonicTrackingLink;
                        }
                      })()}
                    </p>
                  </div>
                )}
                {/* TikTok Link */}
                {campaign.platforms.some(p => p.platform === 'TIKTOK') && (
                  <div>
                    <p className="text-xs font-medium text-pink-600 mb-1">TikTok:</p>
                    <p className="font-mono text-xs bg-pink-50 p-2 rounded break-all text-gray-800 border border-pink-200">
                      {(() => {
                        try {
                          const url = new URL(campaign.tonicTrackingLink);
                          url.searchParams.set('network', 'tiktok');
                          url.searchParams.set('site', 'direct');
                          if (campaign.copyMaster) {
                            url.searchParams.set('adtitle', campaign.copyMaster.substring(0, 100).trim().replace(/\n/g, ' ').replace(/\s+/g, ' '));
                          }
                          url.searchParams.set('ad_id', '__CID__');
                          url.searchParams.set('ttclid', '__CLICKID__');
                          url.searchParams.set('dpco', '1');
                          // Decode to show readable URL
                          return decodeURIComponent(url.toString());
                        } catch {
                          return campaign.tonicTrackingLink;
                        }
                      })()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Platforms */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Platform Status
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {campaign.platforms.map((platform) => {
              const isMeta = platform.platform === 'META';
              const isTikTok = platform.platform === 'TIKTOK';
              const isTaboola = platform.platform === 'TABOOLA';

              const platformConfig = {
                META: {
                  name: 'Meta (Facebook/Instagram)',
                  icon: '📘',
                  bgColor: 'bg-blue-50',
                  borderColor: 'border-blue-200',
                  iconBg: 'bg-blue-100',
                },
                TIKTOK: {
                  name: 'TikTok',
                  icon: '🎵',
                  bgColor: 'bg-pink-50',
                  borderColor: 'border-pink-200',
                  iconBg: 'bg-pink-100',
                },
                TABOOLA: {
                  name: 'Taboola',
                  icon: '📰',
                  bgColor: 'bg-orange-50',
                  borderColor: 'border-orange-200',
                  iconBg: 'bg-orange-100',
                },
              }[platform.platform] || {
                name: platform.platform,
                icon: '📢',
                bgColor: 'bg-gray-50',
                borderColor: 'border-gray-200',
                iconBg: 'bg-gray-100',
              };

              const statusConfig = {
                ACTIVE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
                FAILED: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
                DRAFT: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
                PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
              }[platform.status] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' };

              return (
                <div
                  key={platform.platform}
                  className={`${platformConfig.bgColor} ${platformConfig.borderColor} border-2 rounded-xl p-5 transition-shadow hover:shadow-md`}
                >
                  {/* Header */}
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`${platformConfig.iconBg} w-10 h-10 rounded-lg flex items-center justify-center text-xl`}>
                        {platformConfig.icon}
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {platformConfig.name}
                      </h3>
                    </div>
                    <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                      {platform.status}
                    </span>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Budget */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Budget</p>
                      <p className="text-xl font-bold text-gray-900">
                        ${platform.budget || 0}
                        <span className="text-sm font-normal text-gray-500">/day</span>
                      </p>
                    </div>

                    {/* Campaign ID */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Campaign ID</p>
                      <p className="font-mono text-xs text-gray-800 truncate" title={(isMeta ? platform.metaCampaignId : platform.tiktokCampaignId) || undefined}>
                        {(isMeta ? platform.metaCampaignId : platform.tiktokCampaignId) || <span className="text-gray-400">Not created</span>}
                      </p>
                    </div>

                    {/* Ad Set / Ad Group ID */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                        {isMeta ? 'Ad Set ID' : 'Ad Group ID'}
                      </p>
                      <p className="font-mono text-xs text-gray-800 truncate" title={(isMeta ? platform.metaAdSetId : platform.tiktokAdGroupId) || undefined}>
                        {(isMeta ? platform.metaAdSetId : platform.tiktokAdGroupId) || <span className="text-gray-400">Not created</span>}
                      </p>
                    </div>

                    {/* Ad ID */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">Ad ID</p>
                      <p className="font-mono text-xs text-gray-800 truncate" title={(isMeta ? platform.metaAdId : platform.tiktokAdId) || undefined}>
                        {(isMeta ? platform.metaAdId : platform.tiktokAdId) || <span className="text-gray-400">Not created</span>}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Keywords */}
        {campaign.keywords && campaign.keywords.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🏷️</span> Keywords
              <span className="text-sm font-normal text-gray-500">({campaign.keywords.length})</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {campaign.keywords.map((keyword, index) => (
                <span
                  key={index}
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium border border-blue-200 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Media */}
        {campaign.media.length > 0 && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span>🖼️</span> Media
              <span className="text-sm font-normal text-gray-500">({campaign.media.length} files)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaign.media.map((media) => (
                <div key={media.id} className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Media Preview */}
                  <div className="relative aspect-video bg-gray-100">
                    {media.type === 'IMAGE' ? (
                      <img
                        src={media.url}
                        alt={media.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <video
                        src={media.url}
                        controls
                        className="w-full h-full object-cover"
                      />
                    )}
                    {/* Type Badge */}
                    <span className={`absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-bold ${
                      media.type === 'IMAGE'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-pink-100 text-pink-700'
                    }`}>
                      {media.type === 'IMAGE' ? '📷 Image' : '🎬 Video'}
                    </span>
                  </div>
                  {/* Media Info */}
                  <div className="p-3">
                    <p className="text-sm font-semibold text-gray-800 truncate" title={media.fileName}>
                      {media.fileName}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      {media.generatedByAI ? (
                        <span className="flex items-center gap-1 text-indigo-600">
                          <span>🤖</span> AI Generated
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-600">
                          <span>📤</span> Manual Upload
                        </span>
                      )}
                    </p>
                  </div>
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

        {/* Draft Campaign Notice */}
        {campaign.status === 'DRAFT' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-lg font-bold text-yellow-800 flex items-center gap-2">
                  <span>📝</span> Campaña en Borrador
                </h2>
                <p className="text-yellow-700 mt-1">
                  Esta campaña no ha sido lanzada todavía. Puedes modificar la configuración y volver a intentar.
                </p>
              </div>
              <button
                onClick={handleReconfigure}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                <span>🔄</span>
                Configurar y Lanzar
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-4">
          <Link
            href="/campaigns"
            className="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Back to Campaigns
          </Link>
          {(campaign.status === 'DRAFT' || campaign.status === 'FAILED') && (
            <button
              onClick={handleReconfigure}
              className="bg-orange-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <span>🔄</span>
              Volver a Configurar
            </button>
          )}
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
