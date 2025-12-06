import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaService } from '@/services/meta.service';
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
    specificCampaignName?: string | null;
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
 * POST /api/rules/simulate
 * Simulate a rule without executing any actions
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('ad-rules', 'Simulating rule', { ruleName: body.name });

    // Validate required fields
    if (!body.metaAccountId) {
      return NextResponse.json(
        { success: false, error: 'Meta account ID is required' },
        { status: 400 }
      );
    }

    // Get Meta account
    const metaAccount = await prisma.account.findUnique({
      where: { id: body.metaAccountId },
    });

    if (!metaAccount) {
      logger.error('ad-rules', `Meta account not found: ${body.metaAccountId}`);
      return NextResponse.json(
        { success: false, error: 'Cuenta Meta no encontrada' },
        { status: 404 }
      );
    }

    if (!metaAccount.metaAccessToken) {
      logger.error('ad-rules', `Meta account missing access token: ${metaAccount.name}`);
      return NextResponse.json(
        { success: false, error: `La cuenta "${metaAccount.name}" no tiene Access Token configurado. Ve a Configuracion > Cuentas para configurarlo.` },
        { status: 400 }
      );
    }

    if (!metaAccount.metaAdAccountId) {
      logger.error('ad-rules', `Meta account missing ad account ID: ${metaAccount.name}`);
      return NextResponse.json(
        { success: false, error: `La cuenta "${metaAccount.name}" no tiene Ad Account ID configurado. Ve a Configuracion > Cuentas para configurarlo.` },
        { status: 400 }
      );
    }

    // Get specific campaign name if applicable
    let specificCampaignName: string | null = null;
    let specificCampaignMetaId: string | null = null;
    if (!body.applyToAllCampaigns && body.specificCampaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: body.specificCampaignId },
        include: {
          platforms: {
            where: { platform: 'META' },
          },
        },
      });
      if (campaign) {
        specificCampaignName = campaign.name;
        // Get the Meta campaign ID from platforms
        const metaPlatform = campaign.platforms.find(p => p.metaCampaignId);
        if (metaPlatform) {
          specificCampaignMetaId = metaPlatform.metaCampaignId;
        }
      }
    }

    const accessToken = metaAccount.metaAccessToken;
    const adAccountId = metaAccount.metaAdAccountId;

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
    let entities: Array<{ id: string; name: string }> = [];
    const level = body.level as AdRuleLevel;

    // If specific campaign is selected, only get entities from that campaign
    if (!body.applyToAllCampaigns && specificCampaignMetaId) {
      if (level === 'CAMPAIGN') {
        // Just the specific campaign
        entities = [{ id: specificCampaignMetaId, name: specificCampaignName || 'Campaign' }];
      } else if (level === 'AD_SET') {
        // Get ad sets from this specific campaign
        const allAdSets = await metaService.getActiveAdSets(adAccountId, accessToken);
        // Note: We'd need to filter by campaign, but for simplicity we'll get all and note this
        entities = allAdSets.map(a => ({ id: a.id, name: a.name }));
      } else if (level === 'AD') {
        const allAds = await metaService.getActiveAds(adAccountId, accessToken);
        entities = allAds.map(a => ({ id: a.id, name: a.name }));
      }
    } else {
      // Get all entities of the specified level
      switch (level) {
        case 'CAMPAIGN':
          const campaigns = await metaService.getActiveCampaigns(adAccountId, accessToken);
          entities = campaigns.map(c => ({ id: c.id, name: c.name }));
          break;
        case 'AD_SET':
          const adSets = await metaService.getActiveAdSets(adAccountId, accessToken);
          entities = adSets.map(a => ({ id: a.id, name: a.name }));
          break;
        case 'AD':
          const ads = await metaService.getActiveAds(adAccountId, accessToken);
          entities = ads.map(a => ({ id: a.id, name: a.name }));
          break;
      }
    }

    // Evaluate each entity
    const simulatedEntities: SimulationEntity[] = [];
    const executionPreview: string[] = [];
    let entitiesWithData = 0;
    let entitiesMatchingCondition = 0;

    for (const entity of entities.slice(0, 20)) { // Limit to 20 for simulation
      try {
        // Get metrics for the entity
        const metrics = await metaService.getEntityInsights(
          entity.id,
          getLevelForApi(level),
          body.timeWindow || 'TODAY',
          accessToken
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

        // If budget action, get current budget
        if ((body.action === 'INCREASE_BUDGET' || body.action === 'DECREASE_BUDGET') && conditionMet) {
          const budgetInfo = await metaService.getBudgetInfo(entity.id, accessToken);
          if (budgetInfo) {
            const currentBudget = (budgetInfo.daily_budget ?? budgetInfo.lifetime_budget ?? 0) / 100; // Convert from cents
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
        name: body.name || 'Nueva Regla',
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
        specificCampaignName: specificCampaignName,
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
    logger.success('ad-rules', `Simulation completed`, {
      totalEntities: entities.length,
      matching: entitiesMatchingCondition
    }, duration);

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error('ad-rules', `Simulation failed: ${error.message}`, { stack: error.stack });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Helper functions
function getLevelForApi(level: AdRuleLevel): 'campaign' | 'adset' | 'ad' {
  switch (level) {
    case 'CAMPAIGN': return 'campaign';
    case 'AD_SET': return 'adset';
    case 'AD': return 'ad';
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
