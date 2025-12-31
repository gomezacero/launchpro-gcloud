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
        return { label: 'Pérdida Inmediata', color: 'bg-red-100 text-red-800' };
      case 'TIME_BASED_LOSS':
        return { label: 'Pérdida por Tiempo', color: 'bg-orange-100 text-orange-800' };
      default:
        return { label: type, color: 'bg-gray-100 text-gray-800' };
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚠️</span>
          <h3 className="text-lg font-semibold text-gray-900">Alertas Stop-Loss</h3>
        </div>
        {violations.length > 0 && (
          <span className="px-2 py-1 text-sm font-bold text-red-700 bg-red-100 rounded-full">
            {violations.length}
          </span>
        )}
      </div>

      {violations.length === 0 ? (
        <div className="text-center py-8">
          <span className="text-4xl">✅</span>
          <p className="mt-2 text-sm text-gray-500">No hay alertas activas</p>
          <p className="text-xs text-gray-400">Todas las campañas están dentro de los límites</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {violations.map((violation) => {
            const typeInfo = getViolationLabel(violation.violationType);
            return (
              <div
                key={violation.id}
                className="border border-red-200 bg-red-50 rounded-lg p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">🔴</span>
                      <h4 className="font-medium text-gray-900 truncate">
                        {violation.campaignName}
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="text-red-700 font-semibold">
                        Net Revenue: ${violation.netRevenue.toFixed(2)}
                      </p>
                      {violation.hoursActive && (
                        <p className="text-gray-600">
                          Tiempo activo: {violation.hoursActive.toFixed(1)} horas
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <a
                    href={`/campaigns?id=${violation.campaignId}`}
                    className="flex-1 text-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
                  >
                    Ver Campaña
                  </a>
                  {onAcknowledge && (
                    <button
                      onClick={() => handleAcknowledge(violation.id)}
                      disabled={acknowledging === violation.id}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
                    >
                      {acknowledging === violation.id ? 'Procesando...' : 'Reconocer'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
