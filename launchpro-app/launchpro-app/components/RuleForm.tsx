'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MetaAccount {
  id: string;
  name: string;
  metaAdAccountId: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface RuleFormData {
  name: string;
  isActive: boolean;
  metaAccountId: string;
  level: string;
  targetIds: string[];
  // Campaign scope
  applyToAllCampaigns: boolean;
  specificCampaignId: string;
  // Condition
  metric: string;
  operator: string;
  value: string;
  valueMin: string;
  valueMax: string;
  // Frequency
  frequencyHours: string;
  // Action
  action: string;
  actionValue: string;
  actionValueType: string;
  notifyEmails: string;
  // Schedule
  scheduleHours: number[];
  scheduleDays: number[];
  // Limits
  cooldownMinutes: string;
  maxExecutions: string;
}

interface RuleFormProps {
  initialData?: Partial<RuleFormData>;
  ruleId?: string;
  mode: 'create' | 'edit';
}

const METRICS = [
  { value: 'ROAS', label: 'ROAS (Return on Ad Spend)', description: 'Retorno sobre inversion publicitaria' },
  { value: 'CPA', label: 'CPA (Cost per Action)', description: 'Costo por accion/conversion' },
  { value: 'CPM', label: 'CPM', description: 'Costo por 1000 impresiones' },
  { value: 'CPC', label: 'CPC', description: 'Costo por clic' },
  { value: 'CTR', label: 'CTR (%)', description: 'Tasa de clics' },
  { value: 'SPEND', label: 'Gasto ($)', description: 'Gasto total' },
  { value: 'IMPRESSIONS', label: 'Impresiones', description: 'Numero de impresiones' },
  { value: 'CLICKS', label: 'Clics', description: 'Numero de clics' },
  { value: 'CONVERSIONS', label: 'Conversiones', description: 'Numero de conversiones' },
];

const OPERATORS = [
  { value: 'GREATER_THAN', label: 'Mayor que (>)', needsRange: false },
  { value: 'LESS_THAN', label: 'Menor que (<)', needsRange: false },
  { value: 'BETWEEN', label: 'Entre', needsRange: true },
  { value: 'NOT_BETWEEN', label: 'Fuera de rango', needsRange: true },
];

const ACTIONS = [
  { value: 'NOTIFY', label: 'Enviar notificacion', needsValue: false },
  { value: 'PAUSE', label: 'Pausar', needsValue: false },
  { value: 'UNPAUSE', label: 'Activar', needsValue: false },
  { value: 'INCREASE_BUDGET', label: 'Aumentar presupuesto', needsValue: true },
  { value: 'DECREASE_BUDGET', label: 'Disminuir presupuesto', needsValue: true },
];

const LEVELS = [
  { value: 'CAMPAIGN', label: 'Campana' },
  { value: 'AD_SET', label: 'Ad Set (Conjunto de anuncios)' },
  { value: 'AD', label: 'Anuncio' },
];

const FREQUENCY_OPTIONS = [
  { value: '1', label: 'Cada hora' },
  { value: '2', label: 'Cada 2 horas' },
  { value: '3', label: 'Cada 3 horas' },
  { value: '4', label: 'Cada 4 horas' },
  { value: '6', label: 'Cada 6 horas' },
  { value: '8', label: 'Cada 8 horas' },
  { value: '12', label: 'Cada 12 horas' },
  { value: '24', label: 'Cada 24 horas (1 vez al dia)' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mie' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sab' },
];

export default function RuleForm({ initialData, ruleId, mode }: RuleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaAccounts, setMetaAccounts] = useState<MetaAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  const [formData, setFormData] = useState<RuleFormData>({
    name: initialData?.name || '',
    isActive: initialData?.isActive ?? true,
    metaAccountId: initialData?.metaAccountId || '',
    level: initialData?.level || 'CAMPAIGN',
    targetIds: initialData?.targetIds || [],
    applyToAllCampaigns: initialData?.applyToAllCampaigns ?? false,
    specificCampaignId: initialData?.specificCampaignId || '',
    metric: initialData?.metric || 'ROAS',
    operator: initialData?.operator || 'LESS_THAN',
    value: initialData?.value || '',
    valueMin: initialData?.valueMin || '',
    valueMax: initialData?.valueMax || '',
    frequencyHours: initialData?.frequencyHours || '3',
    action: initialData?.action || 'NOTIFY',
    actionValue: initialData?.actionValue || '',
    actionValueType: initialData?.actionValueType || 'PERCENTAGE',
    notifyEmails: initialData?.notifyEmails || '',
    scheduleHours: initialData?.scheduleHours || [],
    scheduleDays: initialData?.scheduleDays || [],
    cooldownMinutes: initialData?.cooldownMinutes || '60',
    maxExecutions: initialData?.maxExecutions || '',
  });

  useEffect(() => {
    fetchMetaAccounts();
  }, []);

  // Fetch campaigns when Meta account changes or when form mounts
  useEffect(() => {
    if (formData.metaAccountId) {
      fetchCampaigns(formData.metaAccountId);
    }
  }, [formData.metaAccountId]);

  const fetchMetaAccounts = async () => {
    try {
      const response = await fetch('/api/accounts?type=META');
      const data = await response.json();

      const accounts = data.data?.meta || data.data || [];

      if (data.success && Array.isArray(accounts)) {
        setMetaAccounts(accounts);
        if (!initialData?.metaAccountId && accounts.length > 0) {
          setFormData(prev => ({ ...prev, metaAccountId: accounts[0].id }));
        }
      } else {
        console.error('Error fetching Meta accounts:', data.error || 'Invalid response');
        setMetaAccounts([]);
      }
    } catch (err) {
      console.error('Error fetching Meta accounts:', err);
      setMetaAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchCampaigns = async (accountId: string) => {
    setLoadingCampaigns(true);
    try {
      // Fetch ACTIVE campaigns that have Meta platform configured with this account
      const response = await fetch(`/api/campaigns?status=ACTIVE`);
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        // Filter campaigns that have this Meta account
        const filteredCampaigns = data.data.filter((campaign: any) => {
          return campaign.platforms?.some((p: any) =>
            p.platform === 'META' && p.metaAccountId === accountId
          );
        });
        setCampaigns(filteredCampaigns);
      } else {
        setCampaigns([]);
      }
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  };

  const selectedOperator = OPERATORS.find(o => o.value === formData.operator);
  const selectedAction = ACTIONS.find(a => a.value === formData.action);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate
      if (!formData.name.trim()) {
        throw new Error('El nombre es requerido');
      }
      if (!formData.metaAccountId) {
        throw new Error('Selecciona una cuenta Meta');
      }
      if (!formData.applyToAllCampaigns && !formData.specificCampaignId) {
        throw new Error('Selecciona una campana especifica o marca "Aplicar a todas las campanas"');
      }

      // Prepare data
      const payload = {
        name: formData.name.trim(),
        isActive: formData.isActive,
        metaAccountId: formData.metaAccountId,
        level: formData.level,
        targetIds: formData.targetIds,
        applyToAllCampaigns: formData.applyToAllCampaigns,
        specificCampaignId: formData.applyToAllCampaigns ? null : formData.specificCampaignId,
        metric: formData.metric,
        operator: formData.operator,
        value: parseFloat(formData.value) || 0,
        valueMin: selectedOperator?.needsRange ? (parseFloat(formData.valueMin) || 0) : null,
        valueMax: selectedOperator?.needsRange ? (parseFloat(formData.valueMax) || 0) : null,
        frequencyHours: parseInt(formData.frequencyHours) || 3,
        action: formData.action,
        actionValue: selectedAction?.needsValue ? (parseFloat(formData.actionValue) || 0) : null,
        actionValueType: selectedAction?.needsValue ? formData.actionValueType : null,
        notifyEmails: formData.notifyEmails
          ? formData.notifyEmails.split(',').map(e => e.trim()).filter(Boolean)
          : [],
        scheduleHours: formData.scheduleHours,
        scheduleDays: formData.scheduleDays,
        cooldownMinutes: parseInt(formData.cooldownMinutes) || 60,
        maxExecutions: formData.maxExecutions ? parseInt(formData.maxExecutions) : null,
      };

      const url = mode === 'create' ? '/api/rules' : `/api/rules/${ruleId}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (data.success) {
        router.push('/rules');
      } else {
        throw new Error(data.error || 'Error al guardar la regla');
      }
    } catch (err: any) {
      setError(err.message || 'Error al guardar la regla');
    } finally {
      setLoading(false);
    }
  };

  const toggleHour = (hour: number) => {
    setFormData(prev => ({
      ...prev,
      scheduleHours: prev.scheduleHours.includes(hour)
        ? prev.scheduleHours.filter(h => h !== hour)
        : [...prev.scheduleHours, hour].sort((a, b) => a - b),
    }));
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      scheduleDays: prev.scheduleDays.includes(day)
        ? prev.scheduleDays.filter(d => d !== day)
        : [...prev.scheduleDays, day].sort((a, b) => a - b),
    }));
  };

  const selectAllHours = () => {
    setFormData(prev => ({
      ...prev,
      scheduleHours: prev.scheduleHours.length === 24 ? [] : HOURS,
    }));
  };

  const selectAllDays = () => {
    setFormData(prev => ({
      ...prev,
      scheduleDays: prev.scheduleDays.length === 7 ? [] : DAYS.map(d => d.value),
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informacion Basica</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre de la regla *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Ej: Pausar si ROAS < 1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cuenta Meta *
            </label>
            {loadingAccounts ? (
              <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
                Cargando cuentas...
              </div>
            ) : metaAccounts.length === 0 ? (
              <div className="w-full px-4 py-2 border border-red-200 rounded-lg bg-red-50 text-red-600">
                No hay cuentas Meta configuradas
              </div>
            ) : (
              <select
                value={formData.metaAccountId}
                onChange={e => setFormData({ ...formData, metaAccountId: e.target.value, specificCampaignId: '' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar cuenta...</option>
                {metaAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nivel de aplicacion *
            </label>
            <select
              value={formData.level}
              onChange={e => setFormData({ ...formData, level: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {LEVELS.map(level => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              La regla se aplicara a las entidades de este nivel dentro de la campana seleccionada
            </p>
          </div>
        </div>
      </div>

      {/* Campaign Scope - NEW SECTION */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Alcance de la Regla</h2>
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Importante:</strong> Durante el periodo de pruebas, se recomienda aplicar las reglas a campanas especificas para evitar cambios no deseados.
            </p>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="campaignScope"
                checked={!formData.applyToAllCampaigns}
                onChange={() => setFormData({ ...formData, applyToAllCampaigns: false })}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <span className="font-medium text-gray-900">Campana especifica</span>
                <p className="text-xs text-gray-500">La regla solo se aplicara a una campana seleccionada</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="campaignScope"
                checked={formData.applyToAllCampaigns}
                onChange={() => setFormData({ ...formData, applyToAllCampaigns: true, specificCampaignId: '' })}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <span className="font-medium text-gray-900">Todas las campanas</span>
                <p className="text-xs text-gray-500">La regla se aplicara a todas las campanas activas de esta cuenta</p>
              </div>
            </label>
          </div>

          {/* Campaign Selector - Only shown when specific campaign is selected */}
          {!formData.applyToAllCampaigns && formData.metaAccountId && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Seleccionar Campana *
              </label>
              {loadingCampaigns ? (
                <div className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500">
                  Cargando campanas activas...
                </div>
              ) : campaigns.length === 0 ? (
                <div className="w-full px-4 py-2 border border-yellow-200 rounded-lg bg-yellow-50 text-yellow-700">
                  No hay campanas activas con esta cuenta Meta
                </div>
              ) : (
                <select
                  value={formData.specificCampaignId}
                  onChange={e => setFormData({ ...formData, specificCampaignId: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleccionar campana...</option>
                  {campaigns.map(campaign => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Solo se muestran campanas ACTIVAS que usan esta cuenta Meta
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Condition */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Condicion</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Metrica *
            </label>
            <select
              value={formData.metric}
              onChange={e => setFormData({ ...formData, metric: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {METRICS.map(metric => (
                <option key={metric.value} value={metric.value}>
                  {metric.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {METRICS.find(m => m.value === formData.metric)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Operador *
            </label>
            <select
              value={formData.operator}
              onChange={e => setFormData({ ...formData, operator: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {OPERATORS.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </select>
          </div>

          {selectedOperator?.needsRange ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor minimo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.valueMin}
                  onChange={e => setFormData({ ...formData, valueMin: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Valor maximo *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.valueMax}
                  onChange={e => setFormData({ ...formData, valueMax: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="0"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Valor *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.value}
                onChange={e => setFormData({ ...formData, value: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: 1 para ROAS < 1"
              />
            </div>
          )}
        </div>
      </div>

      {/* Action */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Accion</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Accion a ejecutar *
            </label>
            <select
              value={formData.action}
              onChange={e => setFormData({ ...formData, action: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {ACTIONS.map(action => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>

          {selectedAction?.needsValue && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.actionValue}
                  onChange={e => setFormData({ ...formData, actionValue: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Ej: 10"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo
                </label>
                <select
                  value={formData.actionValueType}
                  onChange={e => setFormData({ ...formData, actionValueType: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="PERCENTAGE">Porcentaje (%)</option>
                  <option value="FIXED">Cantidad fija ($)</option>
                </select>
              </div>
            </div>
          )}

          {formData.action === 'NOTIFY' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Emails para notificacion
              </label>
              <input
                type="text"
                value={formData.notifyEmails}
                onChange={e => setFormData({ ...formData, notifyEmails: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="email1@example.com, email2@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Separar multiples emails con comas. Si se deja vacio, se usaran los emails globales.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Schedule & Frequency */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Programacion y Frecuencia</h2>

        {/* Frequency - NEW */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Frecuencia de ejecucion *
          </label>
          <select
            value={formData.frequencyHours}
            onChange={e => setFormData({ ...formData, frequencyHours: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {FREQUENCY_OPTIONS.map(freq => (
              <option key={freq.value} value={freq.value}>
                {freq.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Define cada cuanto tiempo se ejecutara la regla a partir de la hora de inicio programada
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <p className="text-sm text-blue-800">
            <strong>Ejemplo:</strong> Si seleccionas &quot;Cada 3 horas&quot;, dias Martes y Jueves, y hora de inicio 6:00 UTC,
            la regla se ejecutara los Martes y Jueves a las 6:00, 9:00, 12:00, 15:00, 18:00 y 21:00 UTC.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Hora de inicio (UTC)
              </label>
              <button
                type="button"
                onClick={selectAllHours}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {formData.scheduleHours.length === 24 ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Selecciona la(s) hora(s) a partir de las cuales la regla comenzara a ejecutarse segun la frecuencia
            </p>
            <div className="grid grid-cols-12 gap-1">
              {HOURS.map(hour => (
                <button
                  key={hour}
                  type="button"
                  onClick={() => toggleHour(hour)}
                  className={`px-2 py-1 text-xs rounded ${
                    formData.scheduleHours.includes(hour)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {hour.toString().padStart(2, '0')}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Dias de la semana
              </label>
              <button
                type="button"
                onClick={selectAllDays}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {formData.scheduleDays.length === 7 ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Selecciona los dias en que la regla estara activa
            </p>
            <div className="flex gap-2">
              {DAYS.map(day => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => toggleDay(day.value)}
                  className={`px-3 py-2 text-sm rounded ${
                    formData.scheduleDays.includes(day.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Limits */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Limites</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cooldown (minutos)
            </label>
            <input
              type="number"
              value={formData.cooldownMinutes}
              onChange={e => setFormData({ ...formData, cooldownMinutes: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="60"
            />
            <p className="text-xs text-gray-500 mt-1">
              Tiempo minimo entre ejecuciones para la misma entidad
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Maximo de ejecuciones
            </label>
            <input
              type="number"
              value={formData.maxExecutions}
              onChange={e => setFormData({ ...formData, maxExecutions: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Sin limite"
            />
            <p className="text-xs text-gray-500 mt-1">
              Dejar vacio para sin limite
            </p>
          </div>
        </div>
      </div>

      {/* Submit */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading || metaAccounts.length === 0}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Guardando...' : mode === 'create' ? 'Crear Regla' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  );
}
