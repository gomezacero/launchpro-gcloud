'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface AdRuleExecution {
  id: string;
  targetType: string;
  targetId: string;
  targetName: string | null;
  metricValue: number;
  conditionMet: boolean;
  actionTaken: string;
  actionResult: string | null;
  executedAt: string;
}

interface AdRule {
  id: string;
  name: string;
  isActive: boolean;
  level: string;
  targetIds: string[];
  metaAccountId: string;
  metaAccount: {
    id: string;
    name: string;
    metaAdAccountId: string;
  };
  metric: string;
  operator: string;
  value: number;
  valueMin: number | null;
  valueMax: number | null;
  timeWindow: string;
  action: string;
  actionValue: number | null;
  actionValueType: string | null;
  notifyEmails: string[];
  scheduleHours: number[];
  scheduleDays: number[];
  lastCheckedAt: string | null;
  lastTriggeredAt: string | null;
  executionCount: number;
  cooldownMinutes: number;
  maxExecutions: number | null;
  executions: AdRuleExecution[];
  createdAt: string;
  updatedAt: string;
}

const metricLabels: Record<string, string> = {
  ROAS: 'ROAS',
  CPA: 'CPA',
  CPM: 'CPM',
  CPC: 'CPC',
  CTR: 'CTR (%)',
  SPEND: 'Gasto ($)',
  IMPRESSIONS: 'Impresiones',
  CLICKS: 'Clics',
  CONVERSIONS: 'Conversiones',
};

const actionLabels: Record<string, string> = {
  NOTIFY: 'Notificar',
  PAUSE: 'Pausar',
  UNPAUSE: 'Activar',
  INCREASE_BUDGET: 'Aumentar presupuesto',
  DECREASE_BUDGET: 'Disminuir presupuesto',
};

const levelLabels: Record<string, string> = {
  CAMPAIGN: 'Campana',
  AD_SET: 'Ad Set',
  AD: 'Anuncio',
};

const operatorLabels: Record<string, string> = {
  GREATER_THAN: '>',
  LESS_THAN: '<',
  BETWEEN: 'entre',
  NOT_BETWEEN: 'fuera de',
};

const timeWindowLabels: Record<string, string> = {
  TODAY: 'Hoy',
  LAST_7D: 'Ultimos 7 dias',
  LAST_14D: 'Ultimos 14 dias',
  LAST_30D: 'Ultimos 30 dias',
};

export default function RulesPage() {
  const router = useRouter();
  const [rules, setRules] = useState<AdRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<string | null>(null);

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/rules');
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setRules(data.data);
      } else {
        setError(data.error || 'Error al cargar las reglas');
        setRules([]);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar las reglas');
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId: string) => {
    try {
      setTogglingRule(ruleId);
      const response = await fetch(`/api/rules/${ruleId}/toggle`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        setRules(rules.map(r =>
          r.id === ruleId ? { ...r, isActive: data.data.isActive } : r
        ));
      } else {
        alert(data.error || 'Error al cambiar estado de la regla');
      }
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado de la regla');
    } finally {
      setTogglingRule(null);
    }
  };

  const deleteRule = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Estas seguro de eliminar la regla "${ruleName}"?`)) {
      return;
    }

    try {
      setDeletingRule(ruleId);
      const response = await fetch(`/api/rules/${ruleId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        setRules(rules.filter(r => r.id !== ruleId));
      } else {
        alert(data.error || 'Error al eliminar la regla');
      }
    } catch (err: any) {
      alert(err.message || 'Error al eliminar la regla');
    } finally {
      setDeletingRule(null);
    }
  };

  const formatCondition = (rule: AdRule) => {
    const metric = metricLabels[rule.metric] || rule.metric;
    const operator = operatorLabels[rule.operator] || rule.operator;

    if (rule.operator === 'BETWEEN' || rule.operator === 'NOT_BETWEEN') {
      return `${metric} ${operator} ${rule.valueMin} y ${rule.valueMax}`;
    }
    return `${metric} ${operator} ${rule.value}`;
  };

  const formatAction = (rule: AdRule) => {
    const action = actionLabels[rule.action] || rule.action;
    if ((rule.action === 'INCREASE_BUDGET' || rule.action === 'DECREASE_BUDGET') && rule.actionValue) {
      const suffix = rule.actionValueType === 'PERCENTAGE' ? '%' : '$';
      return `${action} ${rule.actionValue}${suffix}`;
    }
    return action;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reglas Automatizadas</h1>
            <p className="text-gray-600 mt-1">
              Automatiza acciones basadas en el rendimiento de tus campanas Meta
            </p>
          </div>
          <Link
            href="/rules/new"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <span>+</span>
            Nueva Regla
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Rules Grid */}
        {rules.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">⚡</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No hay reglas configuradas
            </h3>
            <p className="text-gray-600 mb-6">
              Crea tu primera regla automatizada para optimizar tus campanas
            </p>
            <Link
              href="/rules/new"
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <span>+</span>
              Crear Primera Regla
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`bg-white rounded-xl shadow-sm border-2 ${
                  rule.isActive ? 'border-green-200' : 'border-gray-200'
                } overflow-hidden`}
              >
                {/* Card Header */}
                <div className="p-5 border-b border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {rule.name}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {rule.metaAccount.name}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleRule(rule.id)}
                      disabled={togglingRule === rule.id}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        rule.isActive ? 'bg-green-500' : 'bg-gray-300'
                      } ${togglingRule === rule.id ? 'opacity-50' : ''}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          rule.isActive ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 space-y-3">
                  {/* Level Badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 rounded">
                      {levelLabels[rule.level] || rule.level}
                    </span>
                    <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-700 rounded">
                      {timeWindowLabels[rule.timeWindow] || rule.timeWindow}
                    </span>
                  </div>

                  {/* Condition */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Condicion</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatCondition(rule)}
                    </p>
                  </div>

                  {/* Action */}
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Accion</p>
                    <p className="text-sm font-medium text-gray-900">
                      {formatAction(rule)}
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500">Ejecutada</p>
                      <p className="font-medium">{rule.executionCount} veces</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Ultima vez</p>
                      <p className="font-medium text-xs">
                        {formatDate(rule.lastTriggeredAt)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                  <Link
                    href={`/rules/${rule.id}/history`}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Ver historial
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/rules/${rule.id}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => deleteRule(rule.id, rule.name)}
                      disabled={deletingRule === rule.id}
                      className="text-sm text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
                    >
                      {deletingRule === rule.id ? '...' : 'Eliminar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
