'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import RuleForm from '@/components/RuleForm';

interface RuleFormData {
  name: string;
  isActive: boolean;
  metaAccountId: string;
  level: string;
  targetIds: string[];
  applyToAllCampaigns: boolean;
  specificCampaignIds: string[];
  metric: string;
  operator: string;
  value: string;
  valueMin: string;
  valueMax: string;
  timeWindow: string;
  tonicAccountId: string;
  roasDateRange: string;
  frequencyHours: string;
  action: string;
  actionValue: string;
  actionValueType: string;
  notifyEmails: string;
  scheduleHours: number[];
  scheduleDays: number[];
  cooldownMinutes: string;
  maxExecutions: string;
}

export default function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<Partial<RuleFormData> | null>(null);

  useEffect(() => {
    fetchRule();
  }, [id]);

  const fetchRule = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/rules/${id}`);
      const data = await response.json();

      if (data.success) {
        const rule = data.data;
        setInitialData({
          name: rule.name,
          isActive: rule.isActive,
          metaAccountId: rule.metaAccountId,
          level: rule.level,
          targetIds: rule.targetIds || [],
          // Campaign scope - CRITICAL fields that were missing
          applyToAllCampaigns: rule.applyToAllCampaigns ?? false,
          specificCampaignIds: rule.specificCampaignIds || [],
          metric: rule.metric,
          operator: rule.operator,
          value: rule.value?.toString() || '',
          valueMin: rule.valueMin?.toString() || '',
          valueMax: rule.valueMax?.toString() || '',
          timeWindow: rule.timeWindow,
          // ROAS specific fields - CRITICAL fields that were missing
          tonicAccountId: rule.tonicAccountId || '',
          roasDateRange: rule.roasDateRange || 'today',
          frequencyHours: rule.frequencyHours?.toString() || '3',
          action: rule.action,
          actionValue: rule.actionValue?.toString() || '',
          actionValueType: rule.actionValueType || 'PERCENTAGE',
          notifyEmails: rule.notifyEmails?.join(', ') || '',
          scheduleHours: rule.scheduleHours || [],
          scheduleDays: rule.scheduleDays || [],
          cooldownMinutes: rule.cooldownMinutes?.toString() || '60',
          maxExecutions: rule.maxExecutions?.toString() || '',
        });
      } else {
        setError(data.error || 'Error al cargar la regla');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cargar la regla');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
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
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/rules"
            className="text-blue-600 hover:text-blue-700 text-sm mb-2 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Volver a reglas
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">Editar Regla</h1>
          <p className="text-gray-600 mt-1">
            Modifica la configuracion de la regla
          </p>
        </div>

        {/* Form */}
        {initialData && (
          <RuleForm mode="edit" ruleId={id} initialData={initialData} />
        )}
      </div>
    </div>
  );
}
