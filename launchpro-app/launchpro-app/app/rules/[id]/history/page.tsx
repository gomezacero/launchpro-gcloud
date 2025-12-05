'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

interface AdRuleExecution {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  metricValue: number;
  conditionMet: boolean;
  actionTaken: string;
  actionResult: string | null;
  actionDetails: any;
  executedAt: string;
}

interface AdRule {
  id: string;
  name: string;
  metric: string;
  level: string;
  executions: AdRuleExecution[];
}

const actionLabels: Record<string, string> = {
  NOTIFY: 'Notificacion',
  PAUSE: 'Pausar',
  UNPAUSE: 'Activar',
  INCREASE_BUDGET: 'Aumentar presupuesto',
  DECREASE_BUDGET: 'Disminuir presupuesto',
};

const metricLabels: Record<string, string> = {
  ROAS: 'ROAS',
  CPA: 'CPA',
  CPM: 'CPM',
  CPC: 'CPC',
  CTR: 'CTR',
  SPEND: 'Gasto',
  IMPRESSIONS: 'Impresiones',
  CLICKS: 'Clics',
  CONVERSIONS: 'Conversiones',
};

export default function RuleHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rule, setRule] = useState<AdRule | null>(null);

  useEffect(() => {
    fetchRule();
  }, [id]);

  const fetchRule = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/rules/${id}`);
      const data = await response.json();

      if (data.success) {
        setRule(data.data);
      } else {
        setError(data.error || 'Error al cargar el historial');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatBudgetChange = (details: any) => {
    if (!details) return null;
    if (details.previousBudget !== undefined && details.newBudget !== undefined) {
      const prev = (details.previousBudget / 100).toFixed(2);
      const next = (details.newBudget / 100).toFixed(2);
      return `$${prev} -> $${next}`;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
            <p className="font-medium">Error</p>
            <p>{error}</p>
            <Link href="/rules" className="text-red-600 underline mt-2 inline-block">
              Volver a reglas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/rules"
            className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Volver a reglas
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            Historial de Ejecuciones
          </h1>
          {rule && (
            <p className="text-gray-600 mt-1">
              Regla: <span className="font-medium">{rule.name}</span>
            </p>
          )}
        </div>

        {/* Executions Table */}
        {rule?.executions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Sin ejecuciones aun
            </h3>
            <p className="text-gray-600">
              Esta regla aun no se ha disparado. Las ejecuciones aparenceran aqui cuando la condicion se cumpla.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha/Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entidad
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Accion
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resultado
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rule?.executions.map(execution => (
                  <tr key={execution.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(execution.executedAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {execution.targetName || execution.targetId}
                      </div>
                      <div className="text-xs text-gray-500">
                        {execution.targetType}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {metricLabels[rule.metric] || rule.metric}: {execution.metricValue.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {actionLabels[execution.actionTaken] || execution.actionTaken}
                      </div>
                      {formatBudgetChange(execution.actionDetails) && (
                        <div className="text-xs text-gray-500">
                          {formatBudgetChange(execution.actionDetails)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          execution.actionResult === 'SUCCESS'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {execution.actionResult === 'SUCCESS' ? 'Exitoso' : 'Fallido'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
