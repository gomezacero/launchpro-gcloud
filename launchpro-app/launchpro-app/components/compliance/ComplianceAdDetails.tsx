'use client';

interface ComplianceAd {
  adId: string;
  network: 'facebook' | 'tiktok' | 'taboola';
  status: 'allowed' | 'declined';
  adIdAlignment?: string;
  campaignId: number;
  campaignName?: string;
  adLibraryLink?: string;
  lastCheck: string;
  content?: any;
  metadata?: any;
  reviewRequest?: {
    status: 'pending' | 'accepted' | 'declined';
    message: string;
    date: string;
  } | null;
  tonicAccountId: string;
  tonicAccountName: string;
}

interface ComplianceAdDetailsProps {
  ad: ComplianceAd | null;
  isOpen: boolean;
  onClose: () => void;
  onAppeal: (ad: ComplianceAd) => void;
}

export default function ComplianceAdDetails({ ad, isOpen, onClose, onAppeal }: ComplianceAdDetailsProps) {
  if (!isOpen || !ad) return null;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const getNetworkName = (network: string) => {
    switch (network) {
      case 'facebook': return 'Meta (Facebook/Instagram)';
      case 'tiktok': return 'TikTok';
      case 'taboola': return 'Taboola';
      default: return network;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Detalles del Anuncio</h2>
              <p className="text-sm text-slate-500 font-mono">{ad.adId}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Status Banner */}
            {ad.status === 'declined' && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-rose-800">Anuncio Rechazado</h3>
                    {ad.adIdAlignment ? (
                      <p className="text-sm text-rose-700 mt-1">{ad.adIdAlignment}</p>
                    ) : (
                      <p className="text-sm text-rose-600 mt-1">No se especifico el motivo del rechazo.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {ad.status === 'allowed' && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-emerald-800">Anuncio Aprobado</h3>
                    <p className="text-sm text-emerald-600 mt-1">Este anuncio cumple con las politicas de compliance.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Review Request Status */}
            {ad.reviewRequest && (
              <div className={`p-4 rounded-xl border ${
                ad.reviewRequest.status === 'pending'
                  ? 'bg-amber-50 border-amber-200'
                  : ad.reviewRequest.status === 'accepted'
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-rose-50 border-rose-200'
              }`}>
                <h3 className="font-semibold text-slate-800 mb-2">Estado de Apelacion</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600">Estado:</span>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      ad.reviewRequest.status === 'pending'
                        ? 'bg-amber-100 text-amber-700'
                        : ad.reviewRequest.status === 'accepted'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}>
                      {ad.reviewRequest.status === 'pending' ? 'Pendiente' :
                       ad.reviewRequest.status === 'accepted' ? 'Aceptada' : 'Rechazada'}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">Fecha:</span> {formatDate(ad.reviewRequest.date)}
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-medium">Mensaje:</span>
                    <p className="mt-1 p-2 bg-white/50 rounded-lg text-slate-700">{ad.reviewRequest.message}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Red</div>
                <div className="text-sm text-slate-800 font-medium">{getNetworkName(ad.network)}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Cuenta Tonic</div>
                <div className="text-sm text-slate-800 font-medium">{ad.tonicAccountName}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Campana</div>
                <div className="text-sm text-slate-800 font-medium">{ad.campaignName || `ID: ${ad.campaignId}`}</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Ultima Revision</div>
                <div className="text-sm text-slate-800 font-medium">{formatDate(ad.lastCheck)}</div>
              </div>
            </div>

            {/* Ad Content (if available) */}
            {ad.content && (
              <div className="p-4 rounded-xl bg-slate-50">
                <div className="text-xs text-slate-500 uppercase font-semibold mb-2">Contenido del Anuncio</div>
                <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono bg-white/50 p-3 rounded-lg overflow-auto max-h-40">
                  {typeof ad.content === 'string' ? ad.content : JSON.stringify(ad.content, null, 2)}
                </pre>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-slate-200">
              {ad.adLibraryLink && (
                <a
                  href={ad.adLibraryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium text-center hover:bg-slate-200 transition-colors"
                >
                  Ver en Ad Library
                </a>
              )}
              {ad.status === 'declined' && !ad.reviewRequest && (
                <button
                  onClick={() => onAppeal(ad)}
                  className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/25"
                >
                  Enviar Apelacion
                </button>
              )}
              <button
                onClick={onClose}
                className="py-2.5 px-6 rounded-xl bg-slate-800 text-white font-medium hover:bg-slate-900 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
