'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Platform = 'META' | 'TIKTOK';

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
  platform: Platform;
  level: string;
  targetIds: string[];
  metaAccountId?: string;
  metaAccount?: {
    id: string;
    name: string;
    metaAdAccountId: string;
  };
  tiktokAccountId?: string;
  tiktokAccount?: {
    id: string;
    name: string;
    tiktokAdvertiserId: string;
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
  AD_GROUP: 'Ad Group',
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
  const [activeTab, setActiveTab] = useState<Platform>('META');
  const [metaRules, setMetaRules] = useState<AdRule[]>([]);
  const [tiktokRules, setTiktokRules] = useState<AdRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRule, setTogglingRule] = useState<string | null>(null);
  const [deletingRule, setDeletingRule] = useState<string | null>(null);

  // Get rules based on active tab
  const rules = activeTab === 'META' ? metaRules : tiktokRules;
  const setRules = activeTab === 'META' ? setMetaRules : setTiktokRules;

  useEffect(() => {
    fetchAllRules();
  }, []);

  const fetchAllRules = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both Meta and TikTok rules in parallel
      const [metaResponse, tiktokResponse] = await Promise.all([
        fetch('/api/rules'),
        fetch('/api/tiktok-rules'),
      ]);

      const metaData = await metaResponse.json();
      const tiktokData = await tiktokResponse.json();

      if (metaData.success && Array.isArray(metaData.data)) {
        setMetaRules(metaData.data);
      } else {
        console.error('Error fetching Meta rules:', metaData.error);
        setMetaRules([]);
      }

      if (tiktokData.success && Array.isArray(tiktokData.data)) {
        setTiktokRules(tiktokData.data);
      } else {
        console.error('Error fetching TikTok rules:', tiktokData.error);
        setTiktokRules([]);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar las reglas');
      setMetaRules([]);
      setTiktokRules([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId: string, platform: Platform) => {
    try {
      setTogglingRule(ruleId);
      const apiPath = platform === 'TIKTOK' ? '/api/tiktok-rules' : '/api/rules';
      const response = await fetch(`${apiPath}/${ruleId}/toggle`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        if (platform === 'TIKTOK') {
          setTiktokRules(prev => prev.map(r =>
            r.id === ruleId ? { ...r, isActive: data.data.isActive } : r
          ));
        } else {
          setMetaRules(prev => prev.map(r =>
            r.id === ruleId ? { ...r, isActive: data.data.isActive } : r
          ));
        }
      } else {
        alert(data.error || 'Error al cambiar estado de la regla');
      }
    } catch (err: any) {
      alert(err.message || 'Error al cambiar estado de la regla');
    } finally {
      setTogglingRule(null);
    }
  };

  const deleteRule = async (ruleId: string, ruleName: string, platform: Platform) => {
    if (!confirm(`Estas seguro de eliminar la regla "${ruleName}"?`)) {
      return;
    }

    try {
      setDeletingRule(ruleId);
      const apiPath = platform === 'TIKTOK' ? '/api/tiktok-rules' : '/api/rules';
      const response = await fetch(`${apiPath}/${ruleId}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        if (platform === 'TIKTOK') {
          setTiktokRules(prev => prev.filter(r => r.id !== ruleId));
        } else {
          setMetaRules(prev => prev.filter(r => r.id !== ruleId));
        }
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

  // Get the correct link for new rule based on platform
  const newRuleLink = activeTab === 'META' ? '/rules/new' : '/rules/new-tiktok';

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reglas Automatizadas</h1>
            <p className="text-gray-600 mt-1">
              Automatiza acciones basadas en el rendimiento de tus campanas
            </p>
          </div>
          <Link
            href={newRuleLink}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'META'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-black text-white hover:bg-gray-800'
            }`}
          >
            <span>+</span>
            Nueva Regla {activeTab === 'TIKTOK' ? 'TikTok' : 'Meta'}
          </Link>
        </div>

        {/* Platform Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('META')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'META'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            Meta ({metaRules.length})
          </button>
          <button
            onClick={() => setActiveTab('TIKTOK')}
            className={`px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'TIKTOK'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            TikTok ({tiktokRules.length})
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Rules Grid */}
        {rules.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">{activeTab === 'TIKTOK' ? '🎵' : '⚡'}</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No hay reglas {activeTab === 'TIKTOK' ? 'TikTok' : 'Meta'} configuradas
            </h3>
            <p className="text-gray-600 mb-6">
              Crea tu primera regla automatizada para optimizar tus campanas {activeTab === 'TIKTOK' ? 'TikTok' : 'Meta'}
            </p>
            <Link
              href={newRuleLink}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                activeTab === 'META'
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              <span>+</span>
              Crear Primera Regla {activeTab === 'TIKTOK' ? 'TikTok' : 'Meta'}
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
                        {rule.platform === 'TIKTOK'
                          ? rule.tiktokAccount?.name || 'Sin cuenta'
                          : rule.metaAccount?.name || 'Sin cuenta'}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleRule(rule.id, rule.platform || 'META')}
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
                    href={rule.platform === 'TIKTOK'
                      ? `/rules/tiktok/${rule.id}/history`
                      : `/rules/${rule.id}/history`}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    Ver historial
                  </Link>
                  <div className="flex items-center gap-2">
                    <Link
                      href={rule.platform === 'TIKTOK'
                        ? `/rules/tiktok/${rule.id}`
                        : `/rules/${rule.id}`}
                      className={`text-sm font-medium ${
                        rule.platform === 'TIKTOK'
                          ? 'text-gray-900 hover:text-black'
                          : 'text-blue-600 hover:text-blue-700'
                      }`}
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => deleteRule(rule.id, rule.name, rule.platform || 'META')}
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
