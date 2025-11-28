'use client';

import { useEffect, useRef, useState } from 'react';

interface CampaignLog {
  id: string;
  timestamp: string;
  step: string;
  status: 'pending' | 'in_progress' | 'success' | 'error';
  message: string;
  details?: string;
}

interface CampaignLogsPanelProps {
  campaignId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onComplete: (success: boolean) => void;
}

export default function CampaignLogsPanel({
  campaignId,
  isOpen,
  onClose,
  onComplete,
}: CampaignLogsPanelProps) {
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll cuando hay nuevos logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Polling de logs
  useEffect(() => {
    if (!isOpen || !campaignId) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const fetchLogs = async () => {
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/logs`);
        const data = await res.json();

        if (data.success) {
          setLogs(data.data.logs || []);
          setIsComplete(data.data.isComplete || false);
          setHasError(data.data.hasError || false);

          // Si está completo, detener polling y notificar
          if (data.data.isComplete) {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            onComplete(!data.data.hasError);
          }
        }
      } catch (err) {
        console.error('Error fetching logs:', err);
      }
    };

    // Fetch inicial
    fetchLogs();

    // Iniciar polling cada 2 segundos
    pollingRef.current = setInterval(fetchLogs, 2000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isOpen, campaignId, onComplete]);

  // Resetear estado cuando se cierra
  useEffect(() => {
    if (!isOpen) {
      setLogs([]);
      setIsComplete(false);
      setHasError(false);
    }
  }, [isOpen]);

  const getStatusIcon = (status: CampaignLog['status']) => {
    switch (status) {
      case 'pending':
        return <span className="text-gray-400 text-xl">⏳</span>;
      case 'in_progress':
        return (
          <span className="text-blue-500 text-xl animate-spin inline-block">
            ⚙️
          </span>
        );
      case 'success':
        return <span className="text-green-500 text-xl">✅</span>;
      case 'error':
        return <span className="text-red-500 text-xl">❌</span>;
      default:
        return null;
    }
  };

  const getStatusColor = (status: CampaignLog['status']) => {
    switch (status) {
      case 'pending':
        return 'text-gray-500';
      case 'in_progress':
        return 'text-blue-600';
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
        onClick={() => {
          if (isComplete) onClose();
        }}
      />

      {/* Panel lateral */}
      <div
        className={`fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold">
              {isComplete
                ? hasError
                  ? '❌ Error en el lanzamiento'
                  : '✅ Lanzamiento completado'
                : '🚀 Lanzando campaña...'}
            </h2>
            {isComplete && (
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 text-2xl font-bold"
              >
                ×
              </button>
            )}
          </div>
          {!isComplete && (
            <p className="text-blue-100 text-sm mt-1">
              Por favor espera mientras se procesa tu campaña
            </p>
          )}
        </div>

        {/* Logs */}
        <div className="flex-1 overflow-y-auto p-4 h-[calc(100%-180px)]">
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p>Iniciando proceso...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start gap-3 p-3 rounded-lg ${
                    log.status === 'error'
                      ? 'bg-red-50 border border-red-200'
                      : log.status === 'success'
                        ? 'bg-green-50 border border-green-200'
                        : log.status === 'in_progress'
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getStatusIcon(log.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium ${getStatusColor(log.status)}`}>
                      {log.message}
                    </p>
                    {log.details && (
                      <p className="text-sm text-gray-500 mt-1 break-words">
                        {log.details}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gray-50 border-t">
          {!isComplete ? (
            <div className="flex items-center justify-center gap-2 text-blue-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="font-medium">Procesando...</span>
            </div>
          ) : hasError ? (
            <div className="space-y-3">
              <p className="text-center text-red-600 font-medium">
                Hubo un error durante el lanzamiento
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cerrar
                </button>
                {campaignId && (
                  <a
                    href={`/campaigns/${campaignId}`}
                    className="flex-1 bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium text-center"
                  >
                    Ver detalles
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-center text-green-600 font-medium">
                ¡Tu campaña ha sido lanzada exitosamente!
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  Cerrar
                </button>
                {campaignId && (
                  <a
                    href={`/campaigns/${campaignId}`}
                    className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium text-center"
                  >
                    Ver campaña
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
