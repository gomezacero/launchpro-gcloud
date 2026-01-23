import { prisma } from '@/lib/prisma';
import { metaService } from './meta.service';
import { tonicService, TonicCredentials } from './tonic.service';
import { emailService } from './email.service';
import { logger } from '@/lib/logger';
import { Resend } from 'resend';
import {
  AdRule,
  AdRuleExecution,
  AdRuleLevel,
  AdRuleMetric,
  AdRuleOperator,
  AdRuleAction,
  Account,
} from '@prisma/client';

type AdRuleWithAccount = AdRule & {
  metaAccount: Account | null;
  tonicAccount?: Account | null;
};

// Type for rules that have been verified to have a Meta account
type AdRuleWithMetaAccount = AdRule & {
  metaAccount: Account;
  tonicAccount?: Account | null;
};

interface EvaluationResult {
  totalRules: number;
  evaluated: number;
  triggered: number;
  errors: number;
  details: Array<{
    ruleId: string;
    ruleName: string;
    triggered: boolean;
    error?: string;
  }>;
}

interface MetricData {
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  cpa: number;
}

class AdRulesService {
  private resend: Resend | null = null;

  constructor() {
    if (process.env.RESEND_API_KEY) {
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
  }

  /**
   * Evaluate all active rules
   * Called by the cron job
   */
  async evaluateAllRules(): Promise<EvaluationResult> {
    const startTime = Date.now();
    logger.info('ad-rules', 'Starting evaluation of all active rules');

    const result: EvaluationResult = {
      totalRules: 0,
      evaluated: 0,
      triggered: 0,
      errors: 0,
      details: [],
    };

    try {
      // Get all active META rules with their accounts (not TikTok - those are handled separately)
      const rules = await prisma.adRule.findMany({
        where: {
          isActive: true,
          platform: 'META', // Only Meta rules
        },
        include: { metaAccount: true, tonicAccount: true },
      });

      result.totalRules = rules.length;
      logger.info('ad-rules', `Found ${rules.length} active META rules to evaluate`);

      for (const rule of rules) {
        try {
          // Skip if no Meta account is configured
          if (!rule.metaAccount) {
            logger.warn('ad-rules', `Rule "${rule.name}" skipped: No Meta account configured`);
            continue;
          }

          // Check if rule can execute (schedule, cooldown, max executions)
          if (!this.canExecute(rule)) {
            logger.debug('ad-rules', `Rule "${rule.name}" skipped (schedule/cooldown/max)`);
            continue;
          }

          const triggered = await this.evaluateRule(rule as AdRuleWithMetaAccount);
          result.evaluated++;

          if (triggered) {
            result.triggered++;
          }

          result.details.push({
            ruleId: rule.id,
            ruleName: rule.name,
            triggered,
          });
        } catch (error: any) {
          result.errors++;
          result.details.push({
            ruleId: rule.id,
            ruleName: rule.name,
            triggered: false,
            error: error.message,
          });
          logger.error('ad-rules', `Error evaluating rule "${rule.name}": ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      logger.success('ad-rules', `Evaluation complete`, {
        totalRules: result.totalRules,
        evaluated: result.evaluated,
        triggered: result.triggered,
        errors: result.errors,
      }, duration);

      return result;
    } catch (error: any) {
      logger.error('ad-rules', `Failed to evaluate rules: ${error.message}`);
      throw error;
    }
  }

  /**
   * Evaluate a single rule
   * Returns true if the rule was triggered for any entity
   */
  async evaluateRule(rule: AdRuleWithMetaAccount): Promise<boolean> {
    logger.info('ad-rules', `Evaluating rule: ${rule.name}`, {
      level: rule.level,
      metric: rule.metric,
      operator: rule.operator,
      value: rule.value,
    });

    // Get ad account ID from the account (required)
    const adAccountId = rule.metaAccount.metaAdAccountId;

    if (!adAccountId) {
      logger.warn('ad-rules', `Rule "${rule.name}" skipped: Missing ad account ID`, {
        accountId: rule.metaAccount.id,
        accountName: rule.metaAccount.name,
      });
      return false;
    }

    // Get access token - try account-specific first, then fall back to global settings
    let accessToken = rule.metaAccount.metaAccessToken;

    if (!accessToken) {
      // Try to get global Meta access token from GlobalSettings
      const globalSettings = await prisma.globalSettings.findFirst();
      accessToken = globalSettings?.metaAccessToken || null;

      if (accessToken) {
        logger.info('ad-rules', `Rule "${rule.name}": Using global Meta access token for account "${rule.metaAccount.name}"`);
      } else {
        logger.warn('ad-rules', `Rule "${rule.name}" skipped: No access token in account or global settings`, {
          accountId: rule.metaAccount.id,
          accountName: rule.metaAccount.name,
          adAccountId,
        });
        return false;
      }
    }

    // Prepare Tonic credentials if this is a ROAS rule with Tonic account
    let tonicCredentials: TonicCredentials | null = null;
    let tonicRevenueMap: Map<string, number> | null = null;
    let dateRange: { from: string; to: string } | null = null;

    if (rule.metric === 'ROAS' && rule.tonicAccount) {
      if (rule.tonicAccount.tonicConsumerKey && rule.tonicAccount.tonicConsumerSecret) {
        tonicCredentials = {
          consumer_key: rule.tonicAccount.tonicConsumerKey,
          consumer_secret: rule.tonicAccount.tonicConsumerSecret,
        };

        // Calculate date range from preset
        dateRange = this.getDateRangeFromPreset(rule.roasDateRange || 'today');

        // Pre-fetch Tonic revenue data for the date range using EPC Final endpoint
        try {
          logger.info('ad-rules', `Fetching Tonic gross revenue for range: ${dateRange.from} to ${dateRange.to}`);
          tonicRevenueMap = await tonicService.getCampaignGrossRevenueRange(
            tonicCredentials,
            dateRange.from,
            dateRange.to
          );
          logger.info('ad-rules', `Tonic revenue map built with ${tonicRevenueMap.size} campaigns for ${rule.roasDateRange || 'today'}`);
        } catch (error: any) {
          logger.error('ad-rules', `Failed to fetch Tonic stats: ${error.message}. Will use Meta ROAS as fallback.`);
          tonicRevenueMap = null;
        }
      } else {
        logger.warn('ad-rules', `Rule "${rule.name}" has ROAS metric but Tonic account missing credentials. Using Meta ROAS.`);
      }
    }

    // Get entities to evaluate
    const entities = await this.getEntitiesToEvaluate(rule, adAccountId, accessToken);
    logger.info('ad-rules', `Found ${entities.length} entities to evaluate for rule "${rule.name}"`);

    let anyTriggered = false;

    // Update last checked timestamp
    await prisma.adRule.update({
      where: { id: rule.id },
      data: { lastCheckedAt: new Date() },
    });

    for (const entity of entities) {
      try {
        // Get metrics for the entity
        const datePreset = rule.metric === 'ROAS' && rule.roasDateRange
          ? this.getMetaDatePreset(rule.roasDateRange)
          : rule.timeWindow;

        const metrics = await metaService.getEntityInsights(
          entity.id,
          this.getLevelForApi(rule.level),
          datePreset,
          accessToken
        );

        if (!metrics) {
          logger.debug('ad-rules', `No metrics for entity ${entity.id}`);
          continue;
        }

        // Get the specific metric value
        let metricValue: number;

        if (rule.metric === 'ROAS' && tonicRevenueMap) {
          // Calculate hybrid ROAS using Tonic revenue and Meta cost
          metricValue = this.calculateHybridRoas(entity.name, tonicRevenueMap, metrics.spend, metrics.roas);
        } else {
          metricValue = this.getMetricValue(metrics, rule.metric);
        }

        // Check if condition is met
        const conditionMet = this.checkCondition(
          metricValue,
          rule.operator,
          rule.value,
          rule.valueMin ?? undefined,
          rule.valueMax ?? undefined
        );

        logger.debug('ad-rules', `Entity ${entity.id}: ${rule.metric}=${metricValue}, condition met=${conditionMet}`);

        if (conditionMet) {
          // Execute the action
          const actionResult = await this.executeAction(rule, entity, metricValue, accessToken);

          // Record execution
          await this.recordExecution(rule, entity, metricValue, conditionMet, actionResult);

          // Update rule stats
          await prisma.adRule.update({
            where: { id: rule.id },
            data: {
              lastTriggeredAt: new Date(),
              executionCount: { increment: 1 },
            },
          });

          // Send email notification to rule creator
          if (rule.createdById) {
            const creator = await prisma.manager.findUnique({
              where: { id: rule.createdById },
              select: { email: true },
            });
            if (creator?.email) {
              emailService.sendRuleExecutedEmail(
                {
                  id: rule.id,
                  name: rule.name,
                  platform: rule.platform || 'META',
                  level: rule.level,
                  metric: rule.metric,
                  operator: rule.operator,
                  value: rule.value,
                  action: rule.action,
                },
                {
                  targetName: entity.name,
                  metricValue,
                  actionResult: actionResult.success ? 'SUCCESS' : 'FAILED',
                  actionDetails: actionResult.details,
                },
                creator.email
              ).catch(err => {
                logger.error('ad-rules', `Failed to send execution email: ${err.message}`);
              });
            }
          }

          anyTriggered = true;
        }
      } catch (error: any) {
        logger.error('ad-rules', `Error processing entity ${entity.id}: ${error.message}`);
      }
    }

    return anyTriggered;
  }

  /**
   * Extract Tonic campaign ID from Meta campaign name
   * Format: "4193514_TestPromptCampaign" -> "4193514"
   */
  private extractTonicIdFromCampaignName(name: string): string | null {
    const match = name.match(/^(\d+)_/);
    return match ? match[1] : null;
  }

  /**
   * Calculate hybrid ROAS using Tonic gross revenue and Meta cost
   * Formula: (Tonic Gross Revenue / Meta Cost) * 100
   * Falls back to Meta ROAS if no Tonic data available
   */
  private calculateHybridRoas(
    entityName: string,
    tonicRevenueMap: Map<string, number>,
    metaCost: number,
    metaRoas: number
  ): number {
    const tonicId = this.extractTonicIdFromCampaignName(entityName);

    if (!tonicId) {
      logger.warn('ad-rules', `Could not extract Tonic ID from "${entityName}". Using Meta ROAS: ${metaRoas}`);
      return metaRoas;
    }

    const tonicRevenue = tonicRevenueMap.get(tonicId);

    if (tonicRevenue === undefined || tonicRevenue === 0) {
      logger.warn('ad-rules', `No Tonic revenue for campaign ID ${tonicId}. Using Meta ROAS: ${metaRoas}`);
      return metaRoas;
    }

    if (metaCost <= 0) {
      logger.warn('ad-rules', `Meta cost is zero for "${entityName}". Returning 0 ROAS.`);
      return 0;
    }

    const calculatedRoas = tonicRevenue / metaCost;
    logger.debug('ad-rules', `Hybrid ROAS for "${entityName}": ${calculatedRoas.toFixed(2)} (Tonic: $${tonicRevenue.toFixed(2)}, Meta: $${metaCost.toFixed(2)})`);

    return calculatedRoas;
  }

  /**
   * Convert ROAS date range preset to actual from/to dates (YYYY-MM-DD)
   * Returns both dates for use with Tonic's EPC Final endpoint
   */
  private getDateRangeFromPreset(dateRange: string): { from: string; to: string } {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (dateRange) {
      case 'today':
        return { from: today, to: today };

      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        return { from: yesterdayStr, to: yesterdayStr };

      case 'last7days':
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return { from: sevenDaysAgo.toISOString().split('T')[0], to: today };

      case 'last30days':
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return { from: thirtyDaysAgo.toISOString().split('T')[0], to: today };

      default:
        return { from: today, to: today };
    }
  }

  /**
   * Convert ROAS date range to Meta API date preset
   */
  private getMetaDatePreset(dateRange: string): string {
    switch (dateRange) {
      case 'today':
        return 'today';
      case 'yesterday':
        return 'yesterday';
      case 'last7days':
        return 'last_7d';
      case 'last30days':
        return 'last_30d';
      default:
        return 'today';
    }
  }

  /**
   * Check if a rule can execute based on schedule, cooldown, and max executions
   */
  canExecute(rule: AdRule): boolean {
    const now = new Date();

    // Check max executions
    if (rule.maxExecutions !== null && rule.executionCount >= rule.maxExecutions) {
      logger.debug('ad-rules', `Rule "${rule.name}" reached max executions (${rule.maxExecutions})`);
      return false;
    }

    // Check cooldown
    if (rule.lastTriggeredAt) {
      const cooldownMs = rule.cooldownMinutes * 60 * 1000;
      const timeSinceLastTrigger = now.getTime() - rule.lastTriggeredAt.getTime();
      if (timeSinceLastTrigger < cooldownMs) {
        logger.debug('ad-rules', `Rule "${rule.name}" in cooldown period`);
        return false;
      }
    }

    // Check schedule - hours
    if (rule.scheduleHours.length > 0) {
      const currentHour = now.getUTCHours();
      if (!rule.scheduleHours.includes(currentHour)) {
        logger.debug('ad-rules', `Rule "${rule.name}" not scheduled for hour ${currentHour}`);
        return false;
      }
    }

    // Check schedule - days
    if (rule.scheduleDays.length > 0) {
      const currentDay = now.getUTCDay(); // 0 = Sunday
      if (!rule.scheduleDays.includes(currentDay)) {
        logger.debug('ad-rules', `Rule "${rule.name}" not scheduled for day ${currentDay}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a condition is met
   */
  checkCondition(
    value: number,
    operator: AdRuleOperator,
    threshold: number,
    min?: number,
    max?: number
  ): boolean {
    switch (operator) {
      case 'GREATER_THAN':
        return value > threshold;
      case 'LESS_THAN':
        return value < threshold;
      case 'BETWEEN':
        if (min === undefined || max === undefined) return false;
        return value >= min && value <= max;
      case 'NOT_BETWEEN':
        if (min === undefined || max === undefined) return false;
        return value < min || value > max;
      default:
        return false;
    }
  }

  /**
   * Execute the action for a rule
   */
  async executeAction(
    rule: AdRuleWithAccount,
    entity: { id: string; name: string },
    metricValue: number,
    accessToken: string
  ): Promise<{ success: boolean; action: string; details?: any }> {
    logger.info('ad-rules', `Executing action "${rule.action}" for entity ${entity.id}`);

    try {
      switch (rule.action) {
        case 'NOTIFY':
          await this.sendNotification(rule, entity.name, metricValue);
          return { success: true, action: 'NOTIFY' };

        case 'PAUSE':
          const pauseResult = await metaService.pauseEntity(entity.id, accessToken);
          return { success: pauseResult, action: 'PAUSE' };

        case 'UNPAUSE':
          const unpauseResult = await metaService.unpauseEntity(entity.id, accessToken);
          return { success: unpauseResult, action: 'UNPAUSE' };

        case 'INCREASE_BUDGET':
          return await this.adjustBudget(rule, entity.id, 'increase', accessToken);

        case 'DECREASE_BUDGET':
          return await this.adjustBudget(rule, entity.id, 'decrease', accessToken);

        default:
          return { success: false, action: rule.action, details: 'Unknown action' };
      }
    } catch (error: any) {
      logger.error('ad-rules', `Action execution failed: ${error.message}`);
      return { success: false, action: rule.action, details: error.message };
    }
  }

  /**
   * Adjust budget (increase or decrease)
   */
  private async adjustBudget(
    rule: AdRule,
    entityId: string,
    direction: 'increase' | 'decrease',
    accessToken: string
  ): Promise<{ success: boolean; action: string; details?: any }> {
    // Get current budget
    const budgetInfo = await metaService.getBudgetInfo(entityId, accessToken);
    if (!budgetInfo) {
      return { success: false, action: `${direction.toUpperCase()}_BUDGET`, details: 'Could not get current budget' };
    }

    const currentBudget = budgetInfo.daily_budget ?? budgetInfo.lifetime_budget ?? 0;
    const budgetType = budgetInfo.daily_budget ? 'daily' : 'lifetime';

    if (currentBudget === 0) {
      return { success: false, action: `${direction.toUpperCase()}_BUDGET`, details: 'No budget found' };
    }

    // Calculate new budget
    let newBudget: number;
    if (rule.actionValueType === 'PERCENTAGE') {
      const change = currentBudget * ((rule.actionValue ?? 0) / 100);
      newBudget = direction === 'increase' ? currentBudget + change : currentBudget - change;
    } else {
      // Fixed amount (in cents)
      const change = (rule.actionValue ?? 0) * 100; // Convert to cents
      newBudget = direction === 'increase' ? currentBudget + change : currentBudget - change;
    }

    // Ensure budget doesn't go below minimum (1 dollar = 100 cents)
    newBudget = Math.max(newBudget, 100);
    newBudget = Math.round(newBudget); // Must be integer

    const result = await metaService.updateBudget(entityId, newBudget, budgetType, accessToken);

    return {
      success: result.success,
      action: `${direction.toUpperCase()}_BUDGET`,
      details: {
        previousBudget: result.previousBudget,
        newBudget: result.newBudget,
        budgetType,
        changeType: rule.actionValueType,
        changeValue: rule.actionValue,
      },
    };
  }

  /**
   * Send notification email
   */
  async sendNotification(rule: AdRule, targetName: string, metricValue: number): Promise<void> {
    if (!this.resend) {
      logger.warn('ad-rules', 'Resend not configured, skipping notification');
      return;
    }

    // Get notification emails
    let emails = rule.notifyEmails;
    if (emails.length === 0) {
      // Use global notification emails
      const settings = await prisma.globalSettings.findFirst();
      if (settings?.notificationEmails) {
        emails = settings.notificationEmails.split(',').map(e => e.trim());
      }
    }

    if (emails.length === 0) {
      logger.warn('ad-rules', 'No notification emails configured');
      return;
    }

    const conditionText = this.formatCondition(rule);

    try {
      await this.resend.emails.send({
        from: 'LaunchPro <notifications@launchpro.app>',
        to: emails,
        subject: `Regla "${rule.name}" activada`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a;">Regla Automatizada Activada</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>Regla:</strong> ${rule.name}</p>
              <p style="margin: 8px 0;"><strong>Entidad:</strong> ${targetName}</p>
              <p style="margin: 8px 0;"><strong>Métrica:</strong> ${rule.metric} = ${metricValue.toFixed(2)}</p>
              <p style="margin: 8px 0;"><strong>Condición:</strong> ${conditionText}</p>
              <p style="margin: 8px 0;"><strong>Acción:</strong> ${this.formatAction(rule)}</p>
            </div>
            <p style="color: #666; font-size: 12px;">
              Este mensaje fue generado automáticamente por LaunchPro.
            </p>
          </div>
        `,
      });

      logger.info('ad-rules', `Notification sent to ${emails.join(', ')}`);
    } catch (error: any) {
      logger.error('ad-rules', `Failed to send notification: ${error.message}`);
    }
  }

  /**
   * Record an execution in the database
   */
  private async recordExecution(
    rule: AdRule,
    entity: { id: string; name: string },
    metricValue: number,
    conditionMet: boolean,
    actionResult: { success: boolean; action: string; details?: any }
  ): Promise<void> {
    await prisma.adRuleExecution.create({
      data: {
        ruleId: rule.id,
        targetType: rule.level,
        targetId: entity.id,
        targetName: entity.name,
        metricValue,
        conditionMet,
        actionTaken: actionResult.action,
        actionResult: actionResult.success ? 'SUCCESS' : 'FAILED',
        actionDetails: actionResult.details || null,
      },
    });
  }

  /**
   * Get entities to evaluate based on rule level and targets
   */
  private async getEntitiesToEvaluate(
    rule: AdRuleWithAccount,
    adAccountId: string,
    accessToken: string
  ): Promise<Array<{ id: string; name: string }>> {
    // If specific targets are defined, use them
    if (rule.targetIds.length > 0) {
      return rule.targetIds.map(id => ({ id, name: `Entity ${id}` }));
    }

    const specificCampaignIds = rule.specificCampaignIds || [];
    const shouldFilterByCampaign = !rule.applyToAllCampaigns && specificCampaignIds.length > 0;

    // Get entities based on level
    switch (rule.level) {
      case 'CAMPAIGN':
        const campaigns = await metaService.getActiveCampaigns(adAccountId, accessToken);
        // Filter campaigns by specific IDs if not applying to all
        if (shouldFilterByCampaign) {
          const filtered = campaigns.filter(c => specificCampaignIds.includes(c.id));
          logger.info('ad-rules', `Filtered campaigns: ${filtered.length} of ${campaigns.length} (specific IDs: ${specificCampaignIds.join(', ')})`);
          return filtered.map(c => ({ id: c.id, name: c.name }));
        }
        return campaigns.map(c => ({ id: c.id, name: c.name }));

      case 'AD_SET':
        const adSets = await metaService.getActiveAdSets(adAccountId, accessToken);
        // Filter ad sets by their parent campaign if not applying to all
        if (shouldFilterByCampaign) {
          const filtered = adSets.filter(a => specificCampaignIds.includes(a.campaign_id));
          logger.info('ad-rules', `Filtered ad sets: ${filtered.length} of ${adSets.length} (from campaigns: ${specificCampaignIds.join(', ')})`);
          return filtered.map(a => ({ id: a.id, name: a.name }));
        }
        return adSets.map(a => ({ id: a.id, name: a.name }));

      case 'AD':
        const ads = await metaService.getActiveAds(adAccountId, accessToken);
        // Filter ads by their parent campaign if not applying to all
        if (shouldFilterByCampaign) {
          const filtered = ads.filter(a => specificCampaignIds.includes(a.campaign_id));
          logger.info('ad-rules', `Filtered ads: ${filtered.length} of ${ads.length} (from campaigns: ${specificCampaignIds.join(', ')})`);
          return filtered.map(a => ({ id: a.id, name: a.name }));
        }
        return ads.map(a => ({ id: a.id, name: a.name }));

      default:
        return [];
    }
  }

  /**
   * Get metric value from insights data
   */
  private getMetricValue(metrics: MetricData, metric: AdRuleMetric): number {
    switch (metric) {
      case 'ROAS':
        return metrics.roas;
      case 'CPA':
        return metrics.cpa;
      case 'CPM':
        return metrics.cpm;
      case 'CPC':
        return metrics.cpc;
      case 'CTR':
        return metrics.ctr;
      case 'SPEND':
        return metrics.spend;
      case 'IMPRESSIONS':
        return metrics.impressions;
      case 'CLICKS':
        return metrics.clicks;
      case 'CONVERSIONS':
        return metrics.conversions;
      default:
        return 0;
    }
  }

  /**
   * Convert rule level to API format
   */
  private getLevelForApi(level: AdRuleLevel): 'campaign' | 'adset' | 'ad' {
    switch (level) {
      case 'CAMPAIGN':
        return 'campaign';
      case 'AD_SET':
        return 'adset';
      case 'AD_GROUP': // TikTok uses AD_GROUP, map to adset for Meta
        return 'adset';
      case 'AD':
        return 'ad';
      default:
        return 'campaign';
    }
  }

  /**
   * Format condition for display
   */
  formatCondition(rule: AdRule): string {
    const metricLabels: Record<AdRuleMetric, string> = {
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

    const metric = metricLabels[rule.metric] || rule.metric;

    switch (rule.operator) {
      case 'GREATER_THAN':
        return `${metric} > ${rule.value}`;
      case 'LESS_THAN':
        return `${metric} < ${rule.value}`;
      case 'BETWEEN':
        return `${metric} entre ${rule.valueMin} y ${rule.valueMax}`;
      case 'NOT_BETWEEN':
        return `${metric} fuera de ${rule.valueMin} - ${rule.valueMax}`;
      default:
        return '';
    }
  }

  /**
   * Format action for display
   */
  formatAction(rule: AdRule): string {
    switch (rule.action) {
      case 'NOTIFY':
        return 'Enviar notificación';
      case 'PAUSE':
        return 'Pausar';
      case 'UNPAUSE':
        return 'Activar';
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
      default:
        return rule.action;
    }
  }
}

// Export singleton instance
export const adRulesService = new AdRulesService();
export default adRulesService;
