import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { dashboardService } from './dashboard.service';

/**
 * EverGreen Service
 * Tracks campaigns that meet the EverGreen criteria for 30 consecutive days
 *
 * Criteria (must be met DAILY for 30 consecutive days):
 * - ROI > 40%
 * - Daily Spend > $200 USD (from Meta/TikTok)
 *
 * If ANY day fails either criterion, the streak resets to 0
 */

// EverGreen thresholds
const EVERGREEN_ROI_THRESHOLD = 40; // ROI > 40%
const EVERGREEN_SPEND_THRESHOLD = 200; // Daily spend > $200 USD
const EVERGREEN_DAYS_REQUIRED = 30; // 30 consecutive days

export interface EverGreenUpdateResult {
  campaignsChecked: number;
  qualifiedToday: number;
  streaksReset: number;
  newEverGreens: number;
  errors: string[];
}

export interface CampaignQualification {
  campaignId: string;
  qualifies: boolean;
  roi: number;
  spend: number;
  reason?: string;
}

class EverGreenService {
  /**
   * Update all EverGreen streaks
   * Called daily by cron job
   */
  async updateAllStreaks(): Promise<EverGreenUpdateResult> {
    const result: EverGreenUpdateResult = {
      campaignsChecked: 0,
      qualifiedToday: 0,
      streaksReset: 0,
      newEverGreens: 0,
      errors: [],
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    logger.info('evergreen', 'Starting EverGreen streak update');

    try {
      // Get all ACTIVE campaigns with managers
      const activeCampaigns = await prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          createdById: { not: null },
        },
        select: {
          id: true,
          name: true,
          createdById: true,
          launchedAt: true,
        },
      });

      result.campaignsChecked = activeCampaigns.length;
      logger.info('evergreen', `Checking ${activeCampaigns.length} active campaigns`);

      for (const campaign of activeCampaigns) {
        if (!campaign.createdById) continue;

        try {
          // Check if campaign qualifies for today
          const qualification = await this.checkCampaignQualification(campaign.id);

          // Update streak
          const streakResult = await this.updateCampaignStreak(
            campaign.id,
            campaign.createdById,
            qualification,
            today
          );

          if (qualification.qualifies) {
            result.qualifiedToday++;
          } else {
            result.streaksReset++;
          }

          if (streakResult.becameEverGreen) {
            result.newEverGreens++;
          }
        } catch (campaignError: any) {
          result.errors.push(`Error processing campaign ${campaign.id}: ${campaignError.message}`);
          logger.error('evergreen', `Error processing campaign ${campaign.id}`, { error: campaignError.message });
        }
      }

      logger.success('evergreen', 'EverGreen streak update completed', {
        campaignsChecked: result.campaignsChecked,
        qualifiedToday: result.qualifiedToday,
        streaksReset: result.streaksReset,
        newEverGreens: result.newEverGreens,
        errors: result.errors.length,
      });

      return result;
    } catch (error: any) {
      logger.error('evergreen', 'Failed to run EverGreen update', { error: error.message });
      result.errors.push(`Global error: ${error.message}`);
      return result;
    }
  }

  /**
   * Check if a campaign qualifies for EverGreen today
   */
  async checkCampaignQualification(campaignId: string): Promise<CampaignQualification> {
    try {
      // Get yesterday's metrics (most recent complete data)
      const { grossRevenue, spend, netRevenue } = await dashboardService.calculateCampaignNetRevenue(
        campaignId,
        'yesterday'
      );

      // Calculate ROI
      const roi = spend > 0 ? ((netRevenue / spend) * 100) : 0;

      logger.info('evergreen', `Campaign ${campaignId} qualification check`, {
        grossRevenue,
        spend,
        netRevenue,
        roi,
        roiThreshold: EVERGREEN_ROI_THRESHOLD,
        spendThreshold: EVERGREEN_SPEND_THRESHOLD,
      });

      // Check if meets both criteria
      const meetsROI = roi > EVERGREEN_ROI_THRESHOLD;
      const meetsSpend = spend > EVERGREEN_SPEND_THRESHOLD;
      const qualifies = meetsROI && meetsSpend;

      let reason: string | undefined;
      if (!meetsROI && !meetsSpend) {
        reason = `ROI ${roi.toFixed(2)}% <= ${EVERGREEN_ROI_THRESHOLD}% AND Spend $${spend.toFixed(2)} <= $${EVERGREEN_SPEND_THRESHOLD}`;
      } else if (!meetsROI) {
        reason = `ROI ${roi.toFixed(2)}% <= ${EVERGREEN_ROI_THRESHOLD}%`;
      } else if (!meetsSpend) {
        reason = `Spend $${spend.toFixed(2)} <= $${EVERGREEN_SPEND_THRESHOLD}`;
      }

      return {
        campaignId,
        qualifies,
        roi: Math.round(roi * 100) / 100,
        spend: Math.round(spend * 100) / 100,
        reason,
      };
    } catch (error: any) {
      logger.error('evergreen', `Failed to check campaign qualification for ${campaignId}`, { error: error.message });
      return {
        campaignId,
        qualifies: false,
        roi: 0,
        spend: 0,
        reason: `Error: ${error.message}`,
      };
    }
  }

  /**
   * Update streak for a campaign
   */
  async updateCampaignStreak(
    campaignId: string,
    managerId: string,
    qualification: CampaignQualification,
    date: Date
  ): Promise<{ becameEverGreen: boolean }> {
    // Get or create streak record
    let streak = await prisma.campaignStreak.findUnique({
      where: { campaignId },
    });

    if (!streak) {
      streak = await prisma.campaignStreak.create({
        data: {
          campaignId,
          managerId,
          currentStreak: 0,
          maxStreak: 0,
          isEverGreen: false,
        },
      });
    }

    let becameEverGreen = false;

    if (qualification.qualifies) {
      // Campaign qualifies - increment streak
      const newStreak = streak.currentStreak + 1;

      const updateData: any = {
        currentStreak: newStreak,
        lastQualifyDate: date,
        maxStreak: Math.max(streak.maxStreak, newStreak),
      };

      // Set streak start date if this is the first day
      if (streak.currentStreak === 0) {
        updateData.streakStartDate = date;
      }

      // Check if reached EverGreen status
      if (newStreak >= EVERGREEN_DAYS_REQUIRED && !streak.isEverGreen) {
        updateData.isEverGreen = true;
        updateData.everGreenDate = date;
        becameEverGreen = true;
        logger.success('evergreen', `Campaign ${campaignId} achieved EverGreen status!`, { streak: newStreak });
      }

      await prisma.campaignStreak.update({
        where: { campaignId },
        data: updateData,
      });

      logger.info('evergreen', `Campaign ${campaignId} streak incremented to ${newStreak}`, {
        qualifies: true,
        roi: qualification.roi,
        spend: qualification.spend,
      });
    } else {
      // Campaign does not qualify - reset streak
      if (streak.currentStreak > 0) {
        await prisma.campaignStreak.update({
          where: { campaignId },
          data: {
            currentStreak: 0,
            streakStartDate: null,
          },
        });

        logger.info('evergreen', `Campaign ${campaignId} streak reset to 0`, {
          previousStreak: streak.currentStreak,
          reason: qualification.reason,
          roi: qualification.roi,
          spend: qualification.spend,
        });
      }
    }

    return { becameEverGreen };
  }

  /**
   * Get all campaigns with active streaks for a manager
   */
  async getCampaignsWithStreaks(managerId: string): Promise<any[]> {
    return prisma.campaignStreak.findMany({
      where: {
        managerId,
        currentStreak: { gt: 0 },
      },
      include: {
        campaign: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { currentStreak: 'desc' },
    });
  }

  /**
   * Get all EverGreen campaigns for a manager
   */
  async getEverGreenCampaigns(managerId: string): Promise<any[]> {
    return prisma.campaignStreak.findMany({
      where: {
        managerId,
        isEverGreen: true,
      },
      include: {
        campaign: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { everGreenDate: 'desc' },
    });
  }

  /**
   * Get streak history for a specific campaign
   */
  async getCampaignStreakHistory(campaignId: string): Promise<any | null> {
    return prisma.campaignStreak.findUnique({
      where: { campaignId },
      include: {
        campaign: {
          select: { id: true, name: true, status: true, launchedAt: true },
        },
      },
    });
  }
}

// Export singleton instance
export const everGreenService = new EverGreenService();
export default everGreenService;
