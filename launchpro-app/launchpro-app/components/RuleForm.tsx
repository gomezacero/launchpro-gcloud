'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface MetaAccount {
  id: string;
  name: string;
  metaAdAccountId: string;
}

interface RuleFormData {
  name: string;
  isActive: boolean;
  metaAccountId: string;
  level: string;
  targetIds: string[];
  metric: string;
  operator: string;
  value: string;
  valueMin: string;
  valueMax: string;
  timeWindow: string;
  action: string;
  actionValue: string;
  actionValueType: string;
  notifyEmails: string;
  scheduleHours: number[];
  scheduleDays: number[];
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

const TIME_WINDOWS = [
  { value: 'TODAY', label: 'Hoy' },
  { value: 'LAST_7D', label: 'Ultimos 7 dias' },
  { value: 'LAST_14D', label: 'Ultimos 14 dias' },
  { value: 'LAST_30D', label: 'Ultimos 30 dias' },
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

  const [formData, setFormData] = useState<RuleFormData>({
    name: initialData?.name || '',
    isActive: initialData?.isActive ?? true,
    metaAccountId: initialData?.metaAccountId || '',
    level: initialData?.level || 'CAMPAIGN',
    targetIds: initialData?.targetIds || [],
    metric: initialData?.metric || 'ROAS',
    operator: initialData?.operator || 'LESS_THAN',
    value: initialData?.value || '',
    valueMin: initialData?.valueMin || '',
    valueMax: initialData?.valueMax || '',
    timeWindow: initialData?.timeWindow || 'TODAY',
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

  const fetchMetaAccounts = async () => {
    try {
      const response = await fetch('/api/accounts?type=META');
      const data = await response.json();

      if (data.success) {
        setMetaAccounts(data.data || []);
        // Set first account as default if not editing
        if (!initialData?.metaAccountId && data.data?.length > 0) {
          setFormData(prev => ({ ...prev, metaAccountId: data.data[0].id }));
        }
      }
    } catch (err) {
      console.error('Error fetching Meta accounts:', err);
    } finally {
      setLoadingAccounts(false);
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

      // Prepare data
      const payload = {
        name: formData.name.trim(),
        isActive: formData.isActive,
        metaAccountId: formData.metaAccountId,
        level: formData.level,
        targetIds: formData.targetIds,
        metric: formData.metric,
        operator: formData.operator,
        value: parseFloat(formData.value) || 0,
        valueMin: selectedOperator?.needsRange ? (parseFloat(formData.valueMin) || 0) : null,
        valueMax: selectedOperator?.needsRange ? (parseFloat(formData.valueMax) || 0) : null,
        timeWindow: formData.timeWindow,
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
                onChange={e => setFormData({ ...formData, metaAccountId: e.target.value })}
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
              La regla se aplicara a todas las entidades activas de este nivel
            </p>
          </div>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ventana de tiempo
            </label>
            <select
              value={formData.timeWindow}
              onChange={e => setFormData({ ...formData, timeWindow: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {TIME_WINDOWS.map(tw => (
                <option key={tw.value} value={tw.value}>
                  {tw.label}
                </option>
              ))}
            </select>
          </div>
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

      {/* Schedule */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Programacion</h2>
        <p className="text-sm text-gray-600 mb-4">
          Si no seleccionas horas o dias, la regla se evaluara en todo momento.
        </p>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Horas (UTC)
              </label>
              <button
                type="button"
                onClick={selectAllHours}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {formData.scheduleHours.length === 24 ? 'Deseleccionar todas' : 'Seleccionar todas'}
              </button>
            </div>
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
              Tiempo minimo entre ejecuciones
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
