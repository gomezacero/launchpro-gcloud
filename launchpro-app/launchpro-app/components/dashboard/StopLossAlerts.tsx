'use client';

import { useState } from 'react';

interface StopLossViolation {
  id: string;
  campaignId: string;
  campaignName: string;
  violationType: 'IMMEDIATE_LOSS' | 'TIME_BASED_LOSS';
  netRevenue: number;
  hoursActive: number | null;
  createdAt: string;
}

interface StopLossAlertsProps {
  violations: StopLossViolation[];
  onAcknowledge?: (violationId: string) => Promise<void>;
}

export default function StopLossAlerts({ violations, onAcknowledge }: StopLossAlertsProps) {
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  const handleAcknowledge = async (violationId: string) => {
    if (!onAcknowledge) return;
    setAcknowledging(violationId);
    try {
      await onAcknowledge(violationId);
    } finally {
      setAcknowledging(null);
    }
  };

  const getViolationLabel = (type: string) => {
    switch (type) {
      case 'IMMEDIATE_LOSS':
        return {
          label: 'Perdida Inmediata',
          gradient: 'from-rose-500 to-red-600',
          bg: 'from-rose-50 to-red-50',
          text: 'text-rose-700'
        };
      case 'TIME_BASED_LOSS':
        return {
          label: 'Perdida por Tiempo',
          gradient: 'from-orange-500 to-amber-600',
          bg: 'from-orange-50 to-amber-50',
          text: 'text-orange-700'
        };
      default:
        return {
          label: type,
          gradient: 'from-slate-500 to-slate-600',
          bg: 'from-slate-50 to-slate-100',
          text: 'text-slate-700'
        };
    }
  };

  return (
    <div className="glass-card p-6 relative overflow-hidden">
      {/* Decorative element */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-rose-500 to-red-600 opacity-5 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2"></div>

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-500/25">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-800">Alertas Stop-Loss</h3>
          </div>
          {violations.length > 0 && (
            <span className="px-3 py-1.5 text-sm font-bold text-white bg-gradient-to-r from-rose-500 to-red-600 rounded-full shadow-lg shadow-rose-500/25 animate-pulse">
              {violations.length}
            </span>
          )}
        </div>

        {violations.length === 0 ? (
          <div className="text-center py-10 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-700">No hay alertas activas</p>
            <p className="text-xs text-emerald-500 mt-1">Todas las campañas estan dentro de los limites</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
            {violations.map((violation) => {
              const typeInfo = getViolationLabel(violation.violationType);
              return (
                <div
                  key={violation.id}
                  className={`rounded-xl p-4 bg-gradient-to-r ${typeInfo.bg} border border-white/50 shadow-sm hover:shadow-md transition-all duration-300`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${typeInfo.gradient} animate-pulse`}></div>
                        <h4 className="font-semibold text-slate-800 truncate">
                          {violation.campaignName}
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full bg-white/80 shadow-sm ${typeInfo.text}`}>
                          {typeInfo.label}
                        </span>
                      </div>
                      <div className="text-sm space-y-1.5">
                        <p className={`font-bold ${typeInfo.text}`}>
                          Net Revenue: ${violation.netRevenue.toFixed(2)}
                        </p>
                        {violation.hoursActive && (
                          <p className="text-slate-600 text-xs">
                            Tiempo activo: {violation.hoursActive.toFixed(1)} horas
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <a
                      href={`/campaigns?id=${violation.campaignId}`}
                      className="flex-1 text-center px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-lg shadow-sm hover:shadow-md transition-all duration-300"
                    >
                      Ver Campana
                    </a>
                    {onAcknowledge && (
                      <button
                        onClick={() => handleAcknowledge(violation.id)}
                        disabled={acknowledging === violation.id}
                        className="flex-1 px-4 py-2 text-xs font-semibold text-slate-600 bg-white/80 hover:bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 disabled:opacity-50"
                      >
                        {acknowledging === violation.id ? (
                          <span className="flex items-center justify-center gap-1">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Procesando
                          </span>
                        ) : 'Reconocer'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
