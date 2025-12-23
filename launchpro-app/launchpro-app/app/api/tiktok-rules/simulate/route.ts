import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tiktokService } from '@/services/tiktok.service';
import { logger } from '@/lib/logger';
import { AdRuleLevel, AdRuleMetric, AdRuleOperator, AdRuleAction } from '@prisma/client';

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
  rule: {
    name: string;
    level: string;
    metric: string;
    operator: string;
    value: number;
    valueMin?: number | null;
    valueMax?: number | null;
    action: string;
    actionValue?: number | null;
    actionValueType?: string | null;
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

/**
 * POST /api/tiktok-rules/simulate
 * Simulate a TikTok rule without executing any actions
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('ad-rules', 'Simulating TikTok rule', { ruleName: body.name });

    // Validate required fields
    if (!body.tiktokAccountId) {
      return NextResponse.json(
        { success: false, error: 'TikTok account ID is required' },
        { status: 400 }
      );
    }

    // Get TikTok account
    const tiktokAccount = await prisma.account.findUnique({
      where: { id: body.tiktokAccountId },
    });

    if (!tiktokAccount) {
      logger.error('ad-rules', `TikTok account not found: ${body.tiktokAccountId}`);
      return NextResponse.json(
        { success: false, error: 'Cuenta TikTok no encontrada' },
        { status: 404 }
      );
    }

    if (!tiktokAccount.tiktokAdvertiserId) {
      logger.error('ad-rules', `TikTok account missing advertiser ID: ${tiktokAccount.name}`);
      return NextResponse.json(
        { success: false, error: `La cuenta "${tiktokAccount.name}" no tiene Advertiser ID configurado. Ve a Configuracion > Cuentas para configurarlo.` },
        { status: 400 }
      );
    }

    // Get access token
    let accessToken = tiktokAccount.tiktokAccessToken;
    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findFirst();
      accessToken = globalSettings?.tiktokAccessToken || null;
    }

    if (!accessToken) {
      logger.error('ad-rules', `No access token available for account: ${tiktokAccount.name}`);
      return NextResponse.json(
        { success: false, error: `No hay Access Token configurado. Ve a Configuracion para configurarlo.` },
        { status: 400 }
      );
    }

    // Get specific campaign IDs if applicable
    const specificCampaignIds: string[] = body.specificCampaignIds || [];

    const advertiserId = tiktokAccount.tiktokAdvertiserId;

    // Check if rule can execute based on schedule
    const canExecuteReasons: string[] = [];
    const now = new Date();

    // Check schedule - hours
    if (body.scheduleHours && body.scheduleHours.length > 0) {
      const currentHour = now.getUTCHours();
      if (!body.scheduleHours.includes(currentHour)) {
        canExecuteReasons.push(`Hora actual UTC (${currentHour}:00) no esta en las horas programadas: ${body.scheduleHours.map((h: number) => `${h}:00`).join(', ')}`);
      }
    }

    // Check schedule - days
    if (body.scheduleDays && body.scheduleDays.length > 0) {
      const currentDay = now.getUTCDay();
      const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
      if (!body.scheduleDays.includes(currentDay)) {
        const scheduledDays = body.scheduleDays.map((d: number) => dayNames[d]).join(', ');
        canExecuteReasons.push(`Dia actual (${dayNames[currentDay]}) no esta en los dias programados: ${scheduledDays}`);
      }
    }

    const canExecuteNow = canExecuteReasons.length === 0;

    // Get entities to evaluate
    let entities: Array<{ id: string; name: string; campaign_id?: string }> = [];
    const level = body.level as AdRuleLevel;

    // Get all entities first
    switch (level) {
      case 'CAMPAIGN':
        const campaigns = await tiktokService.getActiveCampaigns(advertiserId, accessToken);
        entities = campaigns.map(c => ({ id: c.id, name: c.name }));
        break;
      case 'AD_GROUP':
        const adGroups = await tiktokService.getActiveAdGroups(advertiserId, accessToken);
        entities = adGroups.map(a => ({ id: a.id, name: a.name, campaign_id: a.campaign_id }));
        break;
      case 'AD':
        const ads = await tiktokService.getActiveAds(advertiserId, accessToken);
        entities = ads.map(a => ({ id: a.id, name: a.name, campaign_id: a.campaign_id }));
        break;
    }

    // Filter by specific campaigns if not applying to all
    if (!body.applyToAllCampaigns && specificCampaignIds.length > 0) {
      if (level === 'CAMPAIGN') {
        // Filter campaigns directly by ID
        entities = entities.filter(e => specificCampaignIds.includes(e.id));
      } else if (level === 'AD_GROUP' || level === 'AD') {
        // Filter ad groups and ads by their parent campaign_id
        entities = entities.filter(e => e.campaign_id && specificCampaignIds.includes(e.campaign_id));
      }
      logger.info('ad-rules', `Filtered to ${entities.length} entities from specific campaigns: ${specificCampaignIds.join(', ')}`);
    }

    // Evaluate each entity
    const simulatedEntities: SimulationEntity[] = [];
    const executionPreview: string[] = [];
    let entitiesWithData = 0;
    let entitiesMatchingCondition = 0;

    for (const entity of entities.slice(0, 20)) { // Limit to 20 for simulation
      try {
        // Get metrics for the entity
        const metrics = await tiktokService.getEntityInsights(
          entity.id,
          getLevelForApi(level),
          body.timeWindow || 'today',
          accessToken,
          advertiserId
        );

        if (!metrics) {
          simulatedEntities.push({
            id: entity.id,
            name: entity.name,
            metricValue: 0,
            conditionMet: false,
            wouldExecuteAction: false,
          });
          continue;
        }

        entitiesWithData++;

        // Get the specific metric value
        const metricValue = getMetricValue(metrics, body.metric as AdRuleMetric);

        // Check if condition is met
        const conditionMet = checkCondition(
          metricValue,
          body.operator as AdRuleOperator,
          parseFloat(body.value) || 0,
          body.valueMin !== undefined ? parseFloat(body.valueMin) : undefined,
          body.valueMax !== undefined ? parseFloat(body.valueMax) : undefined
        );

        const simulatedEntity: SimulationEntity = {
          id: entity.id,
          name: entity.name,
          metricValue,
          conditionMet,
          wouldExecuteAction: conditionMet,
        };

        // If budget action, get current budget (TikTok budgets are in dollars)
        if ((body.action === 'INCREASE_BUDGET' || body.action === 'DECREASE_BUDGET') && conditionMet) {
          const budgetLevel = level === 'AD' ? 'adgroup' : (level === 'CAMPAIGN' ? 'campaign' : 'adgroup');
          const budgetInfo = await tiktokService.getBudgetInfo(entity.id, budgetLevel, advertiserId, accessToken);
          if (budgetInfo) {
            const currentBudget = budgetInfo.budget; // Already in dollars
            simulatedEntity.currentBudget = currentBudget;

            // Calculate projected new budget
            const actionValue = parseFloat(body.actionValue) || 0;
            let newBudget: number;
            if (body.actionValueType === 'PERCENTAGE') {
              const change = currentBudget * (actionValue / 100);
              newBudget = body.action === 'INCREASE_BUDGET'
                ? currentBudget + change
                : currentBudget - change;
            } else {
              newBudget = body.action === 'INCREASE_BUDGET'
                ? currentBudget + actionValue
                : currentBudget - actionValue;
            }
            simulatedEntity.projectedNewBudget = Math.max(newBudget, 1); // Min $1
          }
        }

        if (conditionMet) {
          entitiesMatchingCondition++;
          executionPreview.push(formatExecutionPreview(entity.name, body, metricValue, simulatedEntity));
        }

        simulatedEntities.push(simulatedEntity);
      } catch (error: any) {
        simulatedEntities.push({
          id: entity.id,
          name: entity.name,
          metricValue: 0,
          conditionMet: false,
          wouldExecuteAction: false,
        });
      }
    }

    const result: SimulationResult = {
      success: true,
      rule: {
        name: body.name || 'Nueva Regla TikTok',
        level: body.level,
        metric: body.metric,
        operator: body.operator,
        value: parseFloat(body.value) || 0,
        valueMin: body.valueMin !== undefined ? parseFloat(body.valueMin) : null,
        valueMax: body.valueMax !== undefined ? parseFloat(body.valueMax) : null,
        action: body.action,
        actionValue: body.actionValue !== undefined ? parseFloat(body.actionValue) : null,
        actionValueType: body.actionValueType || null,
        frequencyHours: body.frequencyHours || 3,
        applyToAllCampaigns: body.applyToAllCampaigns ?? false,
        specificCampaignCount: specificCampaignIds.length,
      },
      canExecuteNow,
      canExecuteReasons,
      entities: simulatedEntities,
      summary: {
        totalEntities: entities.length,
        entitiesWithData,
        entitiesMatchingCondition,
        actionThatWouldExecute: formatAction(body),
      },
      executionPreview,
    };

    const duration = Date.now() - startTime;
    logger.success('ad-rules', `TikTok simulation completed`, {
      totalEntities: entities.length,
      matching: entitiesMatchingCondition
    }, duration);

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error('ad-rules', `TikTok simulation failed: ${error.message}`, { stack: error.stack });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Helper functions
function getLevelForApi(level: AdRuleLevel): 'campaign' | 'adgroup' | 'ad' {
  switch (level) {
    case 'CAMPAIGN': return 'campaign';
    case 'AD_GROUP': return 'adgroup';
    case 'AD_SET': return 'adgroup'; // Map AD_SET to adgroup for compatibility
    case 'AD': return 'ad';
    default: return 'campaign';
  }
}

function getMetricValue(metrics: any, metric: AdRuleMetric): number {
  switch (metric) {
    case 'ROAS': return metrics.roas || 0;
    case 'CPA': return metrics.cpa || 0;
    case 'CPM': return metrics.cpm || 0;
    case 'CPC': return metrics.cpc || 0;
    case 'CTR': return metrics.ctr || 0;
    case 'SPEND': return metrics.spend || 0;
    case 'IMPRESSIONS': return metrics.impressions || 0;
    case 'CLICKS': return metrics.clicks || 0;
    case 'CONVERSIONS': return metrics.conversions || 0;
    default: return 0;
  }
}

function checkCondition(
  value: number,
  operator: AdRuleOperator,
  threshold: number,
  min?: number,
  max?: number
): boolean {
  switch (operator) {
    case 'GREATER_THAN': return value > threshold;
    case 'LESS_THAN': return value < threshold;
    case 'BETWEEN':
      if (min === undefined || max === undefined) return false;
      return value >= min && value <= max;
    case 'NOT_BETWEEN':
      if (min === undefined || max === undefined) return false;
      return value < min || value > max;
    default: return false;
  }
}

function formatAction(rule: any): string {
  switch (rule.action) {
    case 'NOTIFY': return 'Enviar notificacion por email';
    case 'PAUSE': return 'Pausar la entidad';
    case 'UNPAUSE': return 'Activar la entidad';
    case 'INCREASE_BUDGET':
      if (rule.actionValueType === 'PERCENTAGE') {
        return `Aumentar presupuesto ${rule.actionValue}%`;
      }
      return `Aumentar presupuesto $${rule.actionValue}`;
    case 'DECREASE_BUDGET':
      if (rule.actionValueType === 'PERCENTAGE') {
        return `Disminuir presupuesto ${rule.actionValue}%`;
      }
      return `Disminuir presupuesto $${rule.actionValue}`;
    default: return rule.action;
  }
}

function formatExecutionPreview(
  entityName: string,
  rule: any,
  metricValue: number,
  entity: SimulationEntity
): string {
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

  const actionLabels: Record<string, string> = {
    NOTIFY: 'se enviaria notificacion',
    PAUSE: 'se PAUSARIA',
    UNPAUSE: 'se ACTIVARIA',
    INCREASE_BUDGET: 'se AUMENTARIA presupuesto',
    DECREASE_BUDGET: 'se DISMINUIRIA presupuesto',
  };

  let preview = `"${entityName}": ${metricLabels[rule.metric] || rule.metric} = ${metricValue.toFixed(2)} -> ${actionLabels[rule.action] || rule.action}`;

  if (entity.currentBudget !== undefined && entity.projectedNewBudget !== undefined) {
    preview += ` (de $${entity.currentBudget.toFixed(2)} a $${entity.projectedNewBudget.toFixed(2)})`;
  }

  return preview;
}
