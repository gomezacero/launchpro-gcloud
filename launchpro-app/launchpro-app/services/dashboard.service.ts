import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService, TonicCredentials } from './tonic.service';
import { metaService } from './meta.service';
import { tiktokService } from './tiktok.service';

/**
 * Dashboard Service
 * Provides metrics calculations for the manager performance dashboard
 */

// Manager Level thresholds (Net Revenue in USD)
const MANAGER_LEVELS = [
  { name: 'Prospect', min: 0, max: 6999, icon: '🌱', color: 'gray' },
  { name: 'Rookie', min: 7000, max: 15000, icon: '🚀', color: 'blue' },
  { name: 'Growth', min: 15001, max: 30000, icon: '📈', color: 'green' },
  { name: 'Performer', min: 30001, max: 40000, icon: '⭐', color: 'purple' },
  { name: 'Scaler', min: 40001, max: 50000, icon: '🔥', color: 'orange' },
  { name: 'Rainmaker', min: 50001, max: Infinity, icon: '💰', color: 'yellow' },
];

// Velocity goals
const WEEKLY_CAMPAIGN_GOAL = 15;
const MONTHLY_CAMPAIGN_GOAL = 60;

// Effectiveness goal
const ROI_GOAL = 30; // 30%

export interface ManagerLevel {
  current: string;
  icon: string;
  color: string;
  monthlyNetRevenue: number;
  nextLevel: string | null;
  amountToNextLevel: number;
  progressPercentage: number;
}

export interface VelocityMetrics {
  weekly: {
    current: number;
    goal: number;
    percentage: number;
  };
  monthly: {
    current: number;
    goal: number;
    percentage: number;
  };
  weekStart: string;
  weekEnd: string;
  monthStart: string;
  monthEnd: string;
}

export interface EffectivenessMetrics {
  roi: number;
  goal: number;
  isAchieving: boolean;
  totalNetRevenue: number;
  totalSpend: number;
  period: string;
}

export interface DashboardMetrics {
  manager: {
    id: string;
    name: string;
    email: string;
  };
  level: ManagerLevel;
  velocity: VelocityMetrics;
  effectiveness: EffectivenessMetrics;
  stopLoss: {
    activeViolations: number;
    campaigns: Array<{
      id: string;
      campaignId: string;
      campaignName: string;
      netRevenue: number;
      hoursActive: number | null;
      violationType: string;
      createdAt: Date;
    }>;
  };
  everGreen: {
    qualified: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
      everGreenDate: string | null;
    }>;
    inProgress: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
    }>;
  };
}

class DashboardService {
  /**
   * Get all dashboard metrics for a manager
   */
  async getDashboardMetrics(managerId: string): Promise<DashboardMetrics | null> {
    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { id: true, name: true, email: true },
    });

    if (!manager) {
      logger.error('dashboard', `Manager not found: ${managerId}`);
      return null;
    }

    // Fetch all metrics in parallel
    const [level, velocity, effectiveness, stopLoss, everGreen] = await Promise.all([
      this.calculateManagerLevel(managerId),
      this.calculateVelocity(managerId),
      this.calculateEffectiveness(managerId),
      this.getStopLossViolations(managerId),
      this.getEverGreenCampaigns(managerId),
    ]);

    return {
      manager,
      level,
      velocity,
      effectiveness,
      stopLoss,
      everGreen,
    };
  }

  /**
   * Get aggregated metrics for all ACTIVE campaigns of a manager
   * Fetches real data from Tonic (Gross Revenue) and Meta/TikTok (Spend)
   */
  async getManagerAggregatedMetrics(
    managerId: string,
    dateRange: 'today' | 'last_30d' | 'this_month' = 'this_month'
  ): Promise<{ grossRevenue: number; totalSpend: number; netRevenue: number }> {
    logger.info('dashboard', `Fetching aggregated metrics for manager ${managerId}, range: ${dateRange}`);

    // Get all ACTIVE campaigns for this manager
    const campaigns = await prisma.campaign.findMany({
      where: {
        createdById: managerId,
        status: 'ACTIVE',
        tonicCampaignId: { not: null },
      },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
            metaAccount: true,
            tiktokAccount: true,
          },
        },
      },
    });

    if (campaigns.length === 0) {
      logger.info('dashboard', `No active campaigns for manager ${managerId}`);
      return { grossRevenue: 0, totalSpend: 0, netRevenue: 0 };
    }

    logger.info('dashboard', `Found ${campaigns.length} active campaigns for manager ${managerId}`);

    // Calculate date range
    const now = new Date();
    let from: string;
    let to: string;

    switch (dateRange) {
      case 'today':
        // Tonic only has data up to yesterday
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        from = to = this.formatDate(yesterday);
        break;
      case 'last_30d':
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        from = this.formatDate(thirtyDaysAgo);
        to = this.formatDate(new Date(now.setDate(now.getDate() - 1)));
        break;
      case 'this_month':
      default:
        const { start, end } = this.getMonthBounds();
        from = this.formatDate(start);
        // Use yesterday as end date since Tonic doesn't have today's data
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        to = this.formatDate(yesterdayDate);
    }

    let totalGrossRevenue = 0;
    let totalSpend = 0;

    // Group campaigns by Tonic account to batch API calls
    const campaignsByTonicAccount = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const tonicPlatform = campaign.platforms.find((p) => p.tonicAccount);
      if (tonicPlatform?.tonicAccount) {
        const key = tonicPlatform.tonicAccount.id;
        if (!campaignsByTonicAccount.has(key)) {
          campaignsByTonicAccount.set(key, []);
        }
        campaignsByTonicAccount.get(key)!.push(campaign);
      }
    }

    // Fetch Gross Revenue from Tonic (batched by account)
    for (const [accountId, accountCampaigns] of campaignsByTonicAccount) {
      const tonicAccount = accountCampaigns[0].platforms.find((p) => p.tonicAccount)?.tonicAccount;
      if (!tonicAccount) continue;

      try {
        const credentials: TonicCredentials = {
          consumer_key: tonicAccount.tonicConsumerKey || '',
          consumer_secret: tonicAccount.tonicConsumerSecret || '',
        };

        const revenueMap = await tonicService.getCampaignGrossRevenueRange(credentials, from, to);

        for (const campaign of accountCampaigns) {
          if (campaign.tonicCampaignId) {
            const revenue = revenueMap.get(campaign.tonicCampaignId) || 0;
            totalGrossRevenue += revenue;
            logger.debug('dashboard', `Campaign ${campaign.name} gross revenue: $${revenue.toFixed(2)}`);
          }
        }
      } catch (error: any) {
        logger.error('dashboard', `Failed to get Tonic revenue for account ${accountId}`, { error: error.message });
      }
    }

    // Fetch Spend from Meta
    for (const campaign of campaigns) {
      const metaPlatform = campaign.platforms.find((p) => p.metaAccount && p.metaCampaignId);
      if (metaPlatform?.metaAccount && metaPlatform.metaCampaignId) {
        try {
          // Convert date range to Meta format
          const metaDatePreset = dateRange === 'today' ? 'YESTERDAY' :
                                  dateRange === 'last_30d' ? 'LAST_30D' : 'THIS_MONTH';

          const insights = await metaService.getEntityInsights(
            metaPlatform.metaCampaignId,
            'campaign',
            metaDatePreset,
            metaPlatform.metaAccount.metaAccessToken || undefined
          );
          if (insights) {
            totalSpend += insights.spend;
            logger.debug('dashboard', `Campaign ${campaign.name} Meta spend: $${insights.spend.toFixed(2)}`);
          }
        } catch (error: any) {
          logger.error('dashboard', `Failed to get Meta spend for campaign ${campaign.name}`, { error: error.message });
        }
      }

      // Fetch Spend from TikTok
      const tiktokPlatform = campaign.platforms.find((p) => p.tiktokAccount && p.tiktokCampaignId);
      if (tiktokPlatform?.tiktokAccount && tiktokPlatform.tiktokCampaignId) {
        try {
          const tiktokDatePreset = dateRange === 'today' ? 'yesterday' :
                                    dateRange === 'last_30d' ? 'last_30_days' : 'this_month';

          const spendMap = await tiktokService.getAllCampaignsSpend(
            tiktokPlatform.tiktokAccount.tiktokAdvertiserId || '',
            tiktokPlatform.tiktokAccount.tiktokAccessToken || '',
            tiktokDatePreset
          );
          const spend = spendMap.get(tiktokPlatform.tiktokCampaignId) || 0;
          totalSpend += spend;
          logger.debug('dashboard', `Campaign ${campaign.name} TikTok spend: $${spend.toFixed(2)}`);
        } catch (error: any) {
          logger.error('dashboard', `Failed to get TikTok spend for campaign ${campaign.name}`, { error: error.message });
        }
      }
    }

    const netRevenue = totalGrossRevenue - totalSpend;

    logger.info('dashboard', `Manager ${managerId} aggregated metrics - Gross: $${totalGrossRevenue.toFixed(2)}, Spend: $${totalSpend.toFixed(2)}, Net: $${netRevenue.toFixed(2)}`);

    return {
      grossRevenue: Math.round(totalGrossRevenue * 100) / 100,
      totalSpend: Math.round(totalSpend * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
    };
  }

  /**
   * Calculate manager level based on monthly net revenue
   * Now fetches real data from APIs instead of cached DailyMetrics
   */
  async calculateManagerLevel(managerId: string): Promise<ManagerLevel> {
    // Get real metrics from APIs for this month
    const { netRevenue: monthlyNetRevenue } = await this.getManagerAggregatedMetrics(managerId, 'this_month');

    // Find current level
    const currentLevel = MANAGER_LEVELS.find(
      (l) => monthlyNetRevenue >= l.min && monthlyNetRevenue <= l.max
    ) || MANAGER_LEVELS[0];

    // Find next level
    const currentIndex = MANAGER_LEVELS.indexOf(currentLevel);
    const nextLevelObj = currentIndex < MANAGER_LEVELS.length - 1 ? MANAGER_LEVELS[currentIndex + 1] : null;

    // Calculate progress within current level
    const levelRange = currentLevel.max - currentLevel.min;
    const progressInLevel = monthlyNetRevenue - currentLevel.min;
    const progressPercentage = levelRange === Infinity
      ? 100
      : Math.min(100, Math.round((progressInLevel / levelRange) * 100));

    return {
      current: currentLevel.name,
      icon: currentLevel.icon,
      color: currentLevel.color,
      monthlyNetRevenue: Math.round(monthlyNetRevenue * 100) / 100,
      nextLevel: nextLevelObj?.name || null,
      amountToNextLevel: nextLevelObj ? Math.max(0, nextLevelObj.min - monthlyNetRevenue) : 0,
      progressPercentage,
    };
  }

  /**
   * Calculate campaign velocity (weekly and monthly)
   */
  async calculateVelocity(managerId: string): Promise<VelocityMetrics> {
    const weekBounds = this.getWeekBounds();
    const monthBounds = this.getMonthBounds();

    // Count campaigns that became ACTIVE (have launchedAt) in each period
    const [weeklyCampaigns, monthlyCampaigns] = await Promise.all([
      prisma.campaign.count({
        where: {
          createdById: managerId,
          status: 'ACTIVE',
          launchedAt: {
            gte: weekBounds.start,
            lte: weekBounds.end,
          },
        },
      }),
      prisma.campaign.count({
        where: {
          createdById: managerId,
          status: 'ACTIVE',
          launchedAt: {
            gte: monthBounds.start,
            lte: monthBounds.end,
          },
        },
      }),
    ]);

    return {
      weekly: {
        current: weeklyCampaigns,
        goal: WEEKLY_CAMPAIGN_GOAL,
        percentage: Math.min(100, Math.round((weeklyCampaigns / WEEKLY_CAMPAIGN_GOAL) * 100)),
      },
      monthly: {
        current: monthlyCampaigns,
        goal: MONTHLY_CAMPAIGN_GOAL,
        percentage: Math.min(100, Math.round((monthlyCampaigns / MONTHLY_CAMPAIGN_GOAL) * 100)),
      },
      weekStart: weekBounds.start.toISOString().split('T')[0],
      weekEnd: weekBounds.end.toISOString().split('T')[0],
      monthStart: monthBounds.start.toISOString().split('T')[0],
      monthEnd: monthBounds.end.toISOString().split('T')[0],
    };
  }

  /**
   * Calculate effectiveness (average ROI over last 30 days)
   * Now fetches real data from APIs instead of cached DailyMetrics
   */
  async calculateEffectiveness(managerId: string): Promise<EffectivenessMetrics> {
    // Get real metrics from APIs for last 30 days
    const { grossRevenue, totalSpend, netRevenue } = await this.getManagerAggregatedMetrics(managerId, 'last_30d');

    // Calculate ROI: ((Gross Revenue - Spend) / Spend) * 100
    // This is equivalent to (Net Revenue / Spend) * 100
    const roi = totalSpend > 0 ? ((netRevenue / totalSpend) * 100) : 0;

    return {
      roi: Math.round(roi * 100) / 100,
      goal: ROI_GOAL,
      isAchieving: roi >= ROI_GOAL,
      totalNetRevenue: netRevenue,
      totalSpend: totalSpend,
      period: 'last_30_days',
    };
  }

  /**
   * Get active stop-loss violations for a manager
   */
  async getStopLossViolations(managerId: string): Promise<{
    activeViolations: number;
    campaigns: Array<{
      id: string;
      campaignId: string;
      campaignName: string;
      netRevenue: number;
      hoursActive: number | null;
      violationType: string;
      createdAt: Date;
    }>;
  }> {
    // Get unacknowledged violations
    const violations = await prisma.stopLossViolation.findMany({
      where: {
        managerId,
        acknowledgedAt: null,
      },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      activeViolations: violations.length,
      campaigns: violations.map((v) => ({
        id: v.id,
        campaignId: v.campaign.id,
        campaignName: v.campaign.name,
        netRevenue: v.netRevenue,
        hoursActive: v.hoursActive,
        violationType: v.violationType,
        createdAt: v.createdAt,
      })),
    };
  }

  /**
   * Get EverGreen campaigns (qualified and in progress)
   */
  async getEverGreenCampaigns(managerId: string): Promise<{
    qualified: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
      everGreenDate: string | null;
    }>;
    inProgress: Array<{
      campaignId: string;
      campaignName: string;
      currentStreak: number;
      maxStreak: number;
      isEverGreen: boolean;
    }>;
  }> {
    const streaks = await prisma.campaignStreak.findMany({
      where: { managerId },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
      orderBy: { currentStreak: 'desc' },
    });

    const qualified = streaks
      .filter((s) => s.isEverGreen || s.currentStreak >= 30)
      .map((s) => ({
        campaignId: s.campaign.id,
        campaignName: s.campaign.name,
        currentStreak: s.currentStreak,
        maxStreak: s.maxStreak,
        isEverGreen: s.isEverGreen,
        everGreenDate: s.everGreenDate?.toISOString() || null,
      }));

    const inProgress = streaks
      .filter((s) => !s.isEverGreen && s.currentStreak > 0 && s.currentStreak < 30)
      .map((s) => ({
        campaignId: s.campaign.id,
        campaignName: s.campaign.name,
        currentStreak: s.currentStreak,
        maxStreak: s.maxStreak,
        isEverGreen: s.isEverGreen,
      }));

    return { qualified, inProgress };
  }

  /**
   * Get comparison data for all managers (SUPERADMIN only)
   */
  async getManagerComparison(): Promise<{
    managers: Array<{
      id: string;
      name: string;
      email: string;
      level: string;
      monthlyNetRevenue: number;
      weeklyVelocity: number;
      monthlyVelocity: number;
      roi: number;
      stopLossViolations: number;
      everGreenCount: number;
    }>;
    rankings: {
      byNetRevenue: string[];
      byVelocity: string[];
      byROI: string[];
    };
  }> {
    try {
      // Get all managers (excluding SUPERADMIN from rankings)
      const managers = await prisma.manager.findMany({
        where: { role: 'MANAGER' },
        select: { id: true, name: true, email: true },
      });

      logger.info('dashboard', `Found ${managers.length} managers for comparison`);

      if (managers.length === 0) {
        return {
          managers: [],
          rankings: { byNetRevenue: [], byVelocity: [], byROI: [] },
        };
      }

      // Fetch metrics for each manager with error handling
      const managersWithMetrics = await Promise.all(
        managers.map(async (m) => {
          try {
            const [level, velocity, effectiveness, stopLoss, everGreen] = await Promise.all([
              this.calculateManagerLevel(m.id),
              this.calculateVelocity(m.id),
              this.calculateEffectiveness(m.id),
              this.getStopLossViolations(m.id),
              this.getEverGreenCampaigns(m.id),
            ]);

            return {
              id: m.id,
              name: m.name,
              email: m.email,
              level: level.current,
              monthlyNetRevenue: level.monthlyNetRevenue,
              weeklyVelocity: velocity.weekly.current,
              monthlyVelocity: velocity.monthly.current,
              roi: effectiveness.roi,
              stopLossViolations: stopLoss.activeViolations,
              everGreenCount: everGreen.qualified.length,
            };
          } catch (err: any) {
            logger.error('dashboard', `Error fetching metrics for manager ${m.id}: ${err.message}`);
            // Return default values on error
            return {
              id: m.id,
              name: m.name,
              email: m.email,
              level: 'Prospect',
              monthlyNetRevenue: 0,
              weeklyVelocity: 0,
              monthlyVelocity: 0,
              roi: 0,
              stopLossViolations: 0,
              everGreenCount: 0,
            };
          }
        })
      );

      // Create rankings
      const byNetRevenue = [...managersWithMetrics]
        .sort((a, b) => b.monthlyNetRevenue - a.monthlyNetRevenue)
        .map((m) => m.id);

      const byVelocity = [...managersWithMetrics]
        .sort((a, b) => b.weeklyVelocity - a.weeklyVelocity)
        .map((m) => m.id);

      const byROI = [...managersWithMetrics]
        .sort((a, b) => b.roi - a.roi)
        .map((m) => m.id);

      return {
        managers: managersWithMetrics,
        rankings: { byNetRevenue, byVelocity, byROI },
      };
    } catch (err: any) {
      logger.error('dashboard', `Error in getManagerComparison: ${err.message}`, { error: err });
      throw err;
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Get bounds for the current week (Monday-Friday)
   */
  getWeekBounds(): { start: Date; end: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay();

    // Find Monday (day 1) of current week
    const monday = new Date(now);
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    monday.setDate(now.getDate() - daysToSubtract);
    monday.setHours(0, 0, 0, 0);

    // Find Friday (day 5) of current week
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return { start: monday, end: friday };
  }

  /**
   * Get bounds for the current month
   */
  getMonthBounds(): { start: Date; end: Date } {
    const now = new Date();

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  /**
   * Format date as YYYY-MM-DD
   */
  formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate net revenue for a specific campaign
   * Used by stop-loss monitoring
   */
  async calculateCampaignNetRevenue(
    campaignId: string,
    dateRange: 'today' | 'yesterday' | 'last_7d' = 'today'
  ): Promise<{ grossRevenue: number; spend: number; netRevenue: number }> {
    // Get campaign with platform associations
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
            metaAccount: true,
            tiktokAccount: true,
          },
        },
      },
    });

    if (!campaign || !campaign.tonicCampaignId) {
      return { grossRevenue: 0, spend: 0, netRevenue: 0 };
    }

    // Calculate date range
    const now = new Date();
    let from: string;
    let to: string;

    switch (dateRange) {
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        from = to = this.formatDate(yesterday);
        break;
      case 'last_7d':
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        from = this.formatDate(sevenDaysAgo);
        to = this.formatDate(new Date(now.setDate(now.getDate() - 1))); // Yesterday
        break;
      case 'today':
      default:
        // Tonic only has data up to yesterday
        const yesterdayForToday = new Date(now);
        yesterdayForToday.setDate(yesterdayForToday.getDate() - 1);
        from = to = this.formatDate(yesterdayForToday);
    }

    let grossRevenue = 0;
    let totalSpend = 0;

    // Get gross revenue from Tonic
    const tonicPlatform = campaign.platforms.find((p) => p.tonicAccount);
    if (tonicPlatform?.tonicAccount) {
      try {
        const credentials: TonicCredentials = {
          consumer_key: tonicPlatform.tonicAccount.tonicConsumerKey || '',
          consumer_secret: tonicPlatform.tonicAccount.tonicConsumerSecret || '',
        };

        const revenueMap = await tonicService.getCampaignGrossRevenueRange(credentials, from, to);
        grossRevenue = revenueMap.get(campaign.tonicCampaignId) || 0;
      } catch (error: any) {
        logger.error('dashboard', `Failed to get Tonic revenue for campaign ${campaignId}`, { error: error.message });
      }
    }

    // Get spend from Meta
    const metaPlatform = campaign.platforms.find((p) => p.metaAccount && p.metaCampaignId);
    if (metaPlatform?.metaAccount && metaPlatform.metaCampaignId) {
      try {
        const insights = await metaService.getEntityInsights(
          metaPlatform.metaCampaignId,
          'campaign',
          dateRange.toUpperCase(),
          metaPlatform.metaAccount.metaAccessToken || undefined
        );
        if (insights) {
          totalSpend += insights.spend;
        }
      } catch (error: any) {
        logger.error('dashboard', `Failed to get Meta spend for campaign ${campaignId}`, { error: error.message });
      }
    }

    // Get spend from TikTok
    const tiktokPlatform = campaign.platforms.find((p) => p.tiktokAccount && p.tiktokCampaignId);
    if (tiktokPlatform?.tiktokAccount && tiktokPlatform.tiktokCampaignId) {
      try {
        const spendMap = await tiktokService.getAllCampaignsSpend(
          tiktokPlatform.tiktokAccount.tiktokAdvertiserId || '',
          tiktokPlatform.tiktokAccount.tiktokAccessToken || '',
          dateRange
        );
        totalSpend += spendMap.get(tiktokPlatform.tiktokCampaignId) || 0;
      } catch (error: any) {
        logger.error('dashboard', `Failed to get TikTok spend for campaign ${campaignId}`, { error: error.message });
      }
    }

    const netRevenue = grossRevenue - totalSpend;

    return {
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      spend: Math.round(totalSpend * 100) / 100,
      netRevenue: Math.round(netRevenue * 100) / 100,
    };
  }
}

// Export singleton instance
export const dashboardService = new DashboardService();
export default dashboardService;
