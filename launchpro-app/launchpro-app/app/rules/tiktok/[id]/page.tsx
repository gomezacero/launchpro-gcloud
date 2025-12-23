'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import TikTokRuleForm from '@/components/TikTokRuleForm';

interface RuleFormData {
  name: string;
  isActive: boolean;
  tiktokAccountId: string;
  level: string;
  targetIds: string[];
  applyToAllCampaigns: boolean;
  specificCampaignIds: string[];
  metric: string;
  operator: string;
  value: string;
  valueMin: string;
  valueMax: string;
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

export default function EditTikTokRulePage({ params }: { params: Promise<{ id: string }> }) {
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
      const response = await fetch(`/api/tiktok-rules/${id}`);
      const data = await response.json();

      if (data.success) {
        const rule = data.data;
        setInitialData({
          name: rule.name,
          isActive: rule.isActive,
          tiktokAccountId: rule.tiktokAccountId,
          level: rule.level,
          targetIds: rule.targetIds,
          applyToAllCampaigns: rule.applyToAllCampaigns,
          specificCampaignIds: rule.specificCampaignIds || [],
          metric: rule.metric,
          operator: rule.operator,
          value: rule.value?.toString() || '',
          valueMin: rule.valueMin?.toString() || '',
          valueMax: rule.valueMax?.toString() || '',
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
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
            className="text-gray-900 hover:text-black text-sm mb-2 inline-flex items-center gap-1"
          >
            <span>&larr;</span> Volver a reglas
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
            <h1 className="text-3xl font-bold text-gray-900">Editar Regla TikTok</h1>
          </div>
          <p className="text-gray-600 mt-1">
            Modifica la configuracion de la regla TikTok
          </p>
        </div>

        {/* Form */}
        {initialData && (
          <TikTokRuleForm mode="edit" ruleId={id} initialData={initialData} />
        )}
      </div>
    </div>
  );
}
