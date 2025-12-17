'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MetaAccount {
  id: string;
  name: string;
  metaAdAccountId: string;
}

interface TonicAccount {
  id: string;
  name: string;
  accountType: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface RoasCalculationResult {
  success: boolean;
  error?: string;
  dateRange: string;
  tonicDate: string;
  campaigns: Array<{
    metaCampaignId: string;
    metaCampaignName: string;
    tonicCampaignId: string | null;
    grossRevenue: number;
    cost: number;
    calculatedRoas: number;
    metaRoas: number;
    error?: string;
  }>;
  totals: {
    totalGrossRevenue: number;
    totalCost: number;
    overallRoas: number;
    campaignsEvaluated: number;
    campaignsWithErrors: number;
  };
  errors: string[];
}

interface SimulationEntity {
  id: string;
  name: string;
  metricValue: number;
  conditionMet: boolean;
  wouldExecuteAction: boolean;
  currentBudget?: number;
  projectedNewBudget?: number;
}

interface SimulationResult {
  success: boolean;
  error?: string;
  rule: {
    name: string;
    level: string;
    metric: string;
    operator: string;
    value: number;
    action: string;
    frequencyHours: number;
    applyToAllCampaigns: boolean;
    specificCampaignCount?: number;
  };
  canExecuteNow: boolean;
  canExecuteReasons: string[];
  entities: SimulationEntity[];
  summary: {
    totalEntities: number;
    entitiesWithData: number;
    entitiesMatchingCondition: number;
    actionThatWouldExecute: string;
  };
  executionPreview: string[];
}

interface RuleFormData {
  name: string;
  isActive: boolean;
  metaAccountId: string;
  level: string;
  targetIds: string[];
  // Campaign scope
  applyToAllCampaigns: boolean;
  specificCampaignIds: string[];
  // Condition
  metric: string;
  operator: string;
  value: string;
  valueMin: string;
  valueMax: string;
  // ROAS specific (Tonic + Meta calculation)
  tonicAccountId: string;
  roasDateRange: string;
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

const ROAS_DATE_RANGE_OPTIONS = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'last7days', label: 'Ultimos 7 dias' },
  { value: 'last30days', label: 'Ultimos 30 dias' },
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
  const [tonicAccounts, setTonicAccounts] = useState<TonicAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Simulation state
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [showSimulationModal, setShowSimulationModal] = useState(false);

  // ROAS calculation state
  const [calculatingRoas, setCalculatingRoas] = useState(false);
  const [roasResult, setRoasResult] = useState<RoasCalculationResult | null>(null);
  const [showRoasModal, setShowRoasModal] = useState(false);

  const [formData, setFormData] = useState<RuleFormData>({
    name: initialData?.name || '',
    isActive: initialData?.isActive ?? true,
    metaAccountId: initialData?.metaAccountId || '',
    level: initialData?.level || 'CAMPAIGN',
    targetIds: initialData?.targetIds || [],
    applyToAllCampaigns: initialData?.applyToAllCampaigns ?? false,
    specificCampaignIds: initialData?.specificCampaignIds || [],
    metric: initialData?.metric || 'ROAS',
    operator: initialData?.operator || 'LESS_THAN',
    value: initialData?.value || '',
    valueMin: initialData?.valueMin || '',
    valueMax: initialData?.valueMax || '',
    tonicAccountId: initialData?.tonicAccountId || '',
    roasDateRange: initialData?.roasDateRange || 'today',
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
      // Fetch Meta accounts
      const metaResponse = await fetch('/api/accounts?type=META');
      const metaData = await metaResponse.json();

      const metaAccountsList = metaData.data?.meta || metaData.data || [];

      if (metaData.success && Array.isArray(metaAccountsList)) {
        setMetaAccounts(metaAccountsList);
        if (!initialData?.metaAccountId && metaAccountsList.length > 0) {
          setFormData(prev => ({ ...prev, metaAccountId: metaAccountsList[0].id }));
        }
      } else {
        console.error('Error fetching Meta accounts:', metaData.error || 'Invalid response');
        setMetaAccounts([]);
      }

      // Fetch Tonic accounts
      const tonicResponse = await fetch('/api/accounts?type=TONIC');
      const tonicData = await tonicResponse.json();

      const tonicAccountsList = tonicData.data?.tonic || tonicData.data || [];

      if (tonicData.success && Array.isArray(tonicAccountsList)) {
        setTonicAccounts(tonicAccountsList);
        // Auto-select first Tonic account if ROAS is selected and no account set
        if (!initialData?.tonicAccountId && tonicAccountsList.length > 0) {
          setFormData(prev => ({ ...prev, tonicAccountId: tonicAccountsList[0].id }));
        }
      } else {
        console.error('Error fetching Tonic accounts:', tonicData.error || 'Invalid response');
        setTonicAccounts([]);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setMetaAccounts([]);
      setTonicAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const fetchCampaigns = async (accountId: string) => {
    setLoadingCampaigns(true);
    try {
      // Fetch ACTIVE campaigns directly from Meta API
      const response = await fetch(`/api/accounts/${accountId}/meta-campaigns`);
      const data = await response.json();

      if (data.success && Array.isArray(data.data)) {
        setCampaigns(data.data);
      } else {
        setCampaigns([]);
        if (data.error) {
          console.warn('Error fetching Meta campaigns:', data.error);
        }
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
      if (!formData.applyToAllCampaigns && formData.specificCampaignIds.length === 0) {
        throw new Error('Selecciona al menos una campana o marca "Aplicar a todas las campanas"');
      }

      // Validate ROAS specific fields
      if (formData.metric === 'ROAS') {
        if (!formData.tonicAccountId) {
          throw new Error('Para la metrica ROAS, debes seleccionar una cuenta Tonic');
        }
        if (!formData.roasDateRange) {
          throw new Error('Para la metrica ROAS, debes seleccionar un rango de fecha');
        }
      }

      // Prepare data
      const payload = {
        name: formData.name.trim(),
        isActive: formData.isActive,
        metaAccountId: formData.metaAccountId,
        level: formData.level,
        targetIds: formData.targetIds,
        applyToAllCampaigns: formData.applyToAllCampaigns,
        specificCampaignIds: formData.applyToAllCampaigns ? [] : formData.specificCampaignIds,
        metric: formData.metric,
        operator: formData.operator,
        value: parseFloat(formData.value) || 0,
        valueMin: selectedOperator?.needsRange ? (parseFloat(formData.valueMin) || 0) : null,
        valueMax: selectedOperator?.needsRange ? (parseFloat(formData.valueMax) || 0) : null,
        // ROAS specific fields
        tonicAccountId: formData.metric === 'ROAS' ? formData.tonicAccountId : null,
        roasDateRange: formData.metric === 'ROAS' ? formData.roasDateRange : null,
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

  // ROAS Calculation function
  const handleCalculateRoas = async () => {
    if (!formData.metaAccountId) {
      setError('Selecciona una cuenta Meta para calcular ROAS');
      return;
    }
    if (!formData.tonicAccountId) {
      setError('Selecciona una cuenta Tonic para calcular ROAS');
      return;
    }
    if (!formData.roasDateRange) {
      setError('Selecciona un rango de fecha para calcular ROAS');
      return;
    }

    setCalculatingRoas(true);
    setError(null);
    setRoasResult(null);

    try {
      const response = await fetch('/api/rules/calculate-roas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metaAccountId: formData.metaAccountId,
          tonicAccountId: formData.tonicAccountId,
          dateRange: formData.roasDateRange,
          // Pass specific campaign IDs if selected (otherwise calculate for all)
          campaignIds: !formData.applyToAllCampaigns ? formData.specificCampaignIds : [],
        }),
      });

      const data = await response.json();

      if (data.success) {
        setRoasResult(data);
        setShowRoasModal(true);
      } else {
        setError(data.error || 'Error al calcular ROAS');
      }
    } catch (err: any) {
      setError(err.message || 'Error al calcular ROAS');
    } finally {
      setCalculatingRoas(false);
    }
  };

  // Simulation function
  const handleSimulate = async () => {
    if (!formData.metaAccountId) {
      setError('Selecciona una cuenta Meta para simular');
      return;
    }

    if (!formData.applyToAllCampaigns && formData.specificCampaignIds.length === 0) {
      setError('Selecciona al menos una campana o marca "Aplicar a todas las campanas" para simular');
      return;
    }

    setSimulating(true);
    setError(null);
    setSimulationResult(null);

    try {
      const response = await fetch('/api/rules/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name || 'Nueva Regla',
          metaAccountId: formData.metaAccountId,
          level: formData.level,
          applyToAllCampaigns: formData.applyToAllCampaigns,
          specificCampaignIds: formData.specificCampaignIds,
          metric: formData.metric,
          operator: formData.operator,
          value: formData.value,
          valueMin: formData.valueMin,
          valueMax: formData.valueMax,
          frequencyHours: formData.frequencyHours,
          timeWindow: 'TODAY', // Use today for simulation
          action: formData.action,
          actionValue: formData.actionValue,
          actionValueType: formData.actionValueType,
          scheduleHours: formData.scheduleHours,
          scheduleDays: formData.scheduleDays,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSimulationResult(data);
        setShowSimulationModal(true);
      } else {
        setError(data.error || 'Error al simular la regla');
      }
    } catch (err: any) {
      setError(err.message || 'Error al simular la regla');
    } finally {
      setSimulating(false);
    }
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
                onChange={e => setFormData({ ...formData, metaAccountId: e.target.value, specificCampaignIds: [] })}
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
                <span className="font-medium text-gray-900">Campanas especificas</span>
                <p className="text-xs text-gray-500">La regla se aplicara a las campanas seleccionadas</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="campaignScope"
                checked={formData.applyToAllCampaigns}
                onChange={() => setFormData({ ...formData, applyToAllCampaigns: true, specificCampaignIds: [] })}
                className="w-4 h-4 text-blue-600"
              />
              <div>
                <span className="font-medium text-gray-900">Todas las campanas</span>
                <p className="text-xs text-gray-500">La regla se aplicara a todas las campanas activas de esta cuenta</p>
              </div>
            </label>
          </div>

          {/* Campaign Selector - Only shown when specific campaigns is selected */}
          {!formData.applyToAllCampaigns && formData.metaAccountId && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seleccionar Campanas * ({formData.specificCampaignIds.length} seleccionada{formData.specificCampaignIds.length !== 1 ? 's' : ''})
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
                <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                  {campaigns.map(campaign => (
                    <label
                      key={campaign.id}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="checkbox"
                        checked={formData.specificCampaignIds.includes(campaign.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              specificCampaignIds: [...formData.specificCampaignIds, campaign.id]
                            });
                          } else {
                            setFormData({
                              ...formData,
                              specificCampaignIds: formData.specificCampaignIds.filter(id => id !== campaign.id)
                            });
                          }
                        }}
                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-900">{campaign.name}</span>
                      <span className="text-xs text-gray-500 ml-auto">{campaign.status}</span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Solo se muestran campanas ACTIVAS que usan esta cuenta Meta. Selecciona una o mas campanas.
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

          {/* ROAS Specific Fields - Only shown when ROAS metric is selected */}
          {formData.metric === 'ROAS' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <div className="flex items-start gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-medium text-blue-900">Calculo de ROAS Hibrido</h4>
                  <p className="text-xs text-blue-700">
                    El ROAS se calculara usando: (Gross Revenue de Tonic / Costo de Meta) x 100
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cuenta Tonic *
                </label>
                {tonicAccounts.length === 0 ? (
                  <div className="w-full px-4 py-2 border border-red-200 rounded-lg bg-red-50 text-red-600 text-sm">
                    No hay cuentas Tonic configuradas
                  </div>
                ) : (
                  <select
                    value={formData.tonicAccountId}
                    onChange={e => setFormData({ ...formData, tonicAccountId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Seleccionar cuenta Tonic...</option>
                    {tonicAccounts.map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Cuenta Tonic para obtener el Gross Revenue de las campanas
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rango de Fecha para ROAS *
                </label>
                <select
                  value={formData.roasDateRange}
                  onChange={e => setFormData({ ...formData, roasDateRange: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {ROAS_DATE_RANGE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Periodo de tiempo para obtener datos de Tonic y Meta
                </p>
              </div>

              {/* Calculate ROAS Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCalculateRoas}
                  disabled={calculatingRoas || !formData.metaAccountId || !formData.tonicAccountId}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {calculatingRoas ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Calculando ROAS...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Calcular ROAS (Debug)
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Calcula y muestra el ROAS de todas las campanas para verificar el mapeo
                </p>
              </div>
            </div>
          )}

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
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleSimulate}
            disabled={simulating || !formData.metaAccountId || (!formData.applyToAllCampaigns && formData.specificCampaignIds.length === 0)}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {simulating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Simulando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                Simular Regla
              </>
            )}
          </button>
          <button
            type="submit"
            disabled={loading || metaAccounts.length === 0}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Guardando...' : mode === 'create' ? 'Crear Regla' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      {/* Simulation Modal */}
      {showSimulationModal && simulationResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Simulacion de Regla</h3>
                <p className="text-purple-200 text-sm">{simulationResult.rule.name}</p>
              </div>
              <button
                onClick={() => setShowSimulationModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Rule Summary */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <h4 className="font-semibold text-gray-900 mb-3">Configuracion de la Regla</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Nivel:</span>
                    <span className="ml-2 font-medium">{simulationResult.rule.level}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Metrica:</span>
                    <span className="ml-2 font-medium">{simulationResult.rule.metric}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Condicion:</span>
                    <span className="ml-2 font-medium">{simulationResult.rule.operator} {simulationResult.rule.value}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Accion:</span>
                    <span className="ml-2 font-medium">{simulationResult.rule.action}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Frecuencia:</span>
                    <span className="ml-2 font-medium">Cada {simulationResult.rule.frequencyHours}h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Alcance:</span>
                    <span className="ml-2 font-medium">
                      {simulationResult.rule.applyToAllCampaigns
                        ? 'Todas las campanas'
                        : `${simulationResult.rule.specificCampaignCount || 0} campana(s) especifica(s)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Can Execute Status */}
              <div className={`rounded-lg p-4 mb-6 ${simulationResult.canExecuteNow ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex items-start gap-3">
                  {simulationResult.canExecuteNow ? (
                    <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-yellow-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <div>
                    <h4 className={`font-semibold ${simulationResult.canExecuteNow ? 'text-green-800' : 'text-yellow-800'}`}>
                      {simulationResult.canExecuteNow ? 'La regla SE EJECUTARIA ahora' : 'La regla NO se ejecutaria ahora'}
                    </h4>
                    {simulationResult.canExecuteReasons.length > 0 && (
                      <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
                        {simulationResult.canExecuteReasons.map((reason, idx) => (
                          <li key={idx}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600">{simulationResult.summary.totalEntities}</div>
                  <div className="text-sm text-blue-800">Entidades totales</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-600">{simulationResult.summary.entitiesWithData}</div>
                  <div className="text-sm text-gray-800">Con datos</div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-orange-600">{simulationResult.summary.entitiesMatchingCondition}</div>
                  <div className="text-sm text-orange-800">Cumplen condicion</div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-purple-600">{simulationResult.summary.actionThatWouldExecute}</div>
                  <div className="text-sm text-purple-800">Accion</div>
                </div>
              </div>

              {/* Execution Preview */}
              {simulationResult.executionPreview.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Acciones que se ejecutarian
                  </h4>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <ul className="space-y-2">
                      {simulationResult.executionPreview.map((preview, idx) => (
                        <li key={idx} className="text-sm text-orange-900 flex items-start gap-2">
                          <span className="text-orange-500 mt-0.5">&#8226;</span>
                          {preview}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Entities Detail Table */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Detalle por Entidad</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="text-left px-3 py-2 rounded-tl-lg">Entidad</th>
                        <th className="text-right px-3 py-2">Valor Metrica</th>
                        <th className="text-center px-3 py-2">Condicion</th>
                        <th className="text-center px-3 py-2">Accion</th>
                        <th className="text-right px-3 py-2 rounded-tr-lg">Presupuesto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationResult.entities.map((entity, idx) => (
                        <tr key={entity.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate" title={entity.name}>
                            {entity.name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {entity.metricValue.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {entity.conditionMet ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Cumple
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                No cumple
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {entity.wouldExecuteAction ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                Si
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {entity.currentBudget !== undefined ? (
                              <span className="text-sm">
                                ${entity.currentBudget.toFixed(2)}
                                {entity.projectedNewBudget !== undefined && (
                                  <span className="text-orange-600"> → ${entity.projectedNewBudget.toFixed(2)}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {simulationResult.entities.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No se encontraron entidades para evaluar
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowSimulationModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROAS Calculation Modal */}
      {showRoasModal && roasResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-green-600 to-green-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Calculo de ROAS</h3>
                <p className="text-green-200 text-sm">
                  Rango: {ROAS_DATE_RANGE_OPTIONS.find(o => o.value === roasResult.dateRange)?.label} | Fecha Tonic: {roasResult.tonicDate}
                </p>
              </div>
              <button
                onClick={() => setShowRoasModal(false)}
                className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">${roasResult.totals.totalGrossRevenue.toFixed(2)}</div>
                  <div className="text-sm text-green-800">Gross Revenue (Tonic)</div>
                </div>
                <div className="bg-red-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-600">${roasResult.totals.totalCost.toFixed(2)}</div>
                  <div className="text-sm text-red-800">Costo (Meta)</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{roasResult.totals.overallRoas.toFixed(2)}%</div>
                  <div className="text-sm text-blue-800">ROAS Calculado</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-gray-600">{roasResult.totals.campaignsEvaluated}</div>
                  <div className="text-sm text-gray-800">Campanas Evaluadas</div>
                </div>
              </div>

              {/* Errors Warning */}
              {roasResult.errors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-yellow-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <h4 className="font-semibold text-yellow-800">Errores de Mapeo ({roasResult.totals.campaignsWithErrors})</h4>
                      <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                        {roasResult.errors.map((err, idx) => (
                          <li key={idx}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaigns Table */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Detalle por Campana</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="text-left px-3 py-2 rounded-tl-lg font-semibold text-gray-900">Campana Meta</th>
                        <th className="text-center px-3 py-2 font-semibold text-gray-900">Tonic ID</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">Gross Revenue</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">Costo</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">ROAS Meta (API)</th>
                        <th className="text-right px-3 py-2 font-semibold text-gray-900">ROAS Calculado</th>
                        <th className="text-center px-3 py-2 rounded-tr-lg font-semibold text-gray-900">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roasResult.campaigns.map((campaign, idx) => (
                        <tr key={campaign.metaCampaignId} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate" title={campaign.metaCampaignName}>
                            {campaign.metaCampaignName}
                          </td>
                          <td className="px-3 py-2 text-center font-mono text-xs text-gray-800 font-medium">
                            {campaign.tonicCampaignId || (
                              <span className="text-red-600 font-medium">No encontrado</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-green-700 font-medium">
                            ${campaign.grossRevenue.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-red-700 font-medium">
                            ${campaign.cost.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-purple-700 font-medium">
                            {campaign.metaRoas.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                            {campaign.calculatedRoas.toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-center">
                            {campaign.error ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800" title={campaign.error}>
                                Warning
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {roasResult.campaigns.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No se encontraron campanas activas
                  </div>
                )}
              </div>

              {/* Formula Explanation */}
              <div className="mt-6 bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">Formula de ROAS</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>
                    <span className="font-semibold text-purple-700">ROAS Meta (API):</span> Valor reportado directamente por la API de Meta
                  </p>
                  <p>
                    <span className="font-semibold text-blue-700">ROAS Calculado:</span>{' '}
                    <code className="bg-gray-200 px-2 py-1 rounded">(Gross Revenue de Tonic / Costo de Meta) x 100</code>
                  </p>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  El mapeo de campanas se realiza extrayendo el ID de Tonic del nombre de la campana en Meta (formato: &quot;1234567_NombreCampana&quot;)
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t bg-gray-50 px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setShowRoasModal(false)}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
