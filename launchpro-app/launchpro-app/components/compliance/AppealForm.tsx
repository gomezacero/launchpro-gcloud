'use client';

import { useState } from 'react';

interface ComplianceAd {
  adId: string;
  network: 'facebook' | 'tiktok' | 'taboola';
  status: 'allowed' | 'declined';
  adIdAlignment?: string;
  campaignId: number;
  campaignName?: string;
}

interface AppealFormProps {
  ad: ComplianceAd | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (adId: string, campaignId: number, message: string) => Promise<void>;
}

export default function AppealForm({ ad, isOpen, onClose, onSubmit }: AppealFormProps) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !ad) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (message.length < 10) {
      setError('El mensaje debe tener al menos 10 caracteres.');
      return;
    }

    if (message.length > 500) {
      setError('El mensaje no puede exceder 500 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(ad.adId, ad.campaignId, message);
      setMessage('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al enviar la apelacion.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setMessage('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose}></div>

      {/* Modal */}
      <div className="relative min-h-screen flex items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full">
          {/* Header */}
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Enviar Apelacion</h2>
              <p className="text-sm text-slate-500">Ad ID: {ad.adId}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Rejection Reason */}
            {ad.adIdAlignment && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                <div className="text-xs text-rose-600 uppercase font-semibold mb-1">Motivo del Rechazo</div>
                <p className="text-sm text-rose-800">{ad.adIdAlignment}</p>
              </div>
            )}

            {/* Info */}
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-800">
                  Tu apelacion sera revisada por el equipo de Trust & Safety de Tonic.
                  Proporciona una explicacion clara de por que crees que el anuncio deberia ser aprobado.
                </p>
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label htmlFor="appealMessage" className="block text-sm font-medium text-slate-700 mb-2">
                Mensaje de Apelacion
              </label>
              <textarea
                id="appealMessage"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Explica por que este anuncio deberia ser reconsiderado..."
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none"
              />
              <div className="flex justify-between mt-2">
                <span className={`text-xs ${message.length < 10 ? 'text-rose-500' : 'text-slate-400'}`}>
                  Minimo 10 caracteres
                </span>
                <span className={`text-xs ${message.length > 500 ? 'text-rose-500' : 'text-slate-400'}`}>
                  {message.length}/500
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || message.length < 10 || message.length > 500}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  'Enviar Apelacion'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
