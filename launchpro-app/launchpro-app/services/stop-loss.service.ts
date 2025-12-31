import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { dashboardService } from './dashboard.service';
import { emailService } from './email.service';
import { StopLossType } from '@prisma/client';

/**
 * Stop-Loss Service
 * Monitors campaigns for stop-loss violations and sends alerts
 *
 * Rules:
 * - IMMEDIATE_LOSS: Net Revenue <= -$35 USD
 * - TIME_BASED_LOSS: Campaign ACTIVE >= 48 hours AND Net Revenue <= -$10 USD
 */

// Stop-Loss thresholds
const IMMEDIATE_LOSS_THRESHOLD = -35; // USD
const TIME_BASED_LOSS_THRESHOLD = -10; // USD
const TIME_BASED_HOURS_THRESHOLD = 48; // hours

export interface StopLossCheckResult {
  campaignsChecked: number;
  violationsFound: number;
  alertsSent: number;
  errors: string[];
}

export interface CampaignViolation {
  campaignId: string;
  campaignName: string;
  managerId: string;
  managerEmail: string;
  violationType: StopLossType;
  netRevenue: number;
  hoursActive: number | null;
}

class StopLossService {
  /**
   * Check all active campaigns for stop-loss violations
   * Called by cron job every 15 minutes
   */
  async checkAllActiveCampaigns(): Promise<StopLossCheckResult> {
    const result: StopLossCheckResult = {
      campaignsChecked: 0,
      violationsFound: 0,
      alertsSent: 0,
      errors: [],
    };

    logger.info('stop-loss', 'Starting stop-loss check for all active campaigns');

    try {
      // Get all ACTIVE campaigns with their managers
      const activeCampaigns = await prisma.campaign.findMany({
        where: {
          status: 'ACTIVE',
          createdById: { not: null }, // Must have an owner
        },
        include: {
          createdBy: {
            select: { id: true, email: true, name: true },
          },
          platforms: {
            include: {
              tonicAccount: true,
              metaAccount: true,
              tiktokAccount: true,
            },
          },
        },
      });

      result.campaignsChecked = activeCampaigns.length;
      logger.info('stop-loss', `Checking ${activeCampaigns.length} active campaigns`);

      // Check each campaign
      for (const campaign of activeCampaigns) {
        if (!campaign.createdBy) continue;

        try {
          const violation = await this.checkCampaign(campaign);

          if (violation) {
            result.violationsFound++;

            // Check if we already have an unacknowledged violation for this campaign
            const existingViolation = await prisma.stopLossViolation.findFirst({
              where: {
                campaignId: campaign.id,
                acknowledgedAt: null,
              },
            });

            if (!existingViolation) {
              // Create new violation record
              await prisma.stopLossViolation.create({
                data: {
                  campaignId: campaign.id,
                  managerId: campaign.createdById!,
                  violationType: violation.violationType,
                  netRevenue: violation.netRevenue,
                  hoursActive: violation.hoursActive,
                },
              });

              // Send alert email
              try {
                await this.sendStopLossAlert(violation);
                result.alertsSent++;
                logger.success('stop-loss', `Alert sent for campaign ${campaign.name}`, {
                  violationType: violation.violationType,
                  netRevenue: violation.netRevenue,
                });
              } catch (emailError: any) {
                result.errors.push(`Failed to send email for campaign ${campaign.id}: ${emailError.message}`);
                logger.error('stop-loss', `Failed to send stop-loss alert email`, { error: emailError.message });
              }
            } else {
              logger.info('stop-loss', `Violation already exists for campaign ${campaign.name}, skipping`);
            }
          }
        } catch (campaignError: any) {
          result.errors.push(`Error checking campaign ${campaign.id}: ${campaignError.message}`);
          logger.error('stop-loss', `Error checking campaign ${campaign.id}`, { error: campaignError.message });
        }
      }

      logger.success('stop-loss', 'Stop-loss check completed', {
        campaignsChecked: result.campaignsChecked,
        violationsFound: result.violationsFound,
        alertsSent: result.alertsSent,
        errors: result.errors.length,
      });

      return result;
    } catch (error: any) {
      logger.error('stop-loss', 'Failed to run stop-loss check', { error: error.message });
      result.errors.push(`Global error: ${error.message}`);
      return result;
    }
  }

  /**
   * Check a single campaign for stop-loss violations
   */
  async checkCampaign(campaign: {
    id: string;
    name: string;
    launchedAt: Date | null;
    createdBy: { id: string; email: string; name: string } | null;
  }): Promise<CampaignViolation | null> {
    if (!campaign.createdBy || !campaign.launchedAt) {
      return null;
    }

    // Calculate hours since launch
    const hoursActive = this.calculateHoursActive(campaign.launchedAt);

    // Get net revenue for this campaign
    const { netRevenue } = await dashboardService.calculateCampaignNetRevenue(campaign.id, 'last_7d');

    logger.info('stop-loss', `Checking campaign ${campaign.name}`, {
      netRevenue,
      hoursActive,
      immediateThreshold: IMMEDIATE_LOSS_THRESHOLD,
      timeBasedThreshold: TIME_BASED_LOSS_THRESHOLD,
    });

    // Check IMMEDIATE_LOSS: Net Revenue <= -$35
    if (netRevenue <= IMMEDIATE_LOSS_THRESHOLD) {
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        managerId: campaign.createdBy.id,
        managerEmail: campaign.createdBy.email,
        violationType: 'IMMEDIATE_LOSS',
        netRevenue,
        hoursActive,
      };
    }

    // Check TIME_BASED_LOSS: >= 48 hours AND Net Revenue <= -$10
    if (hoursActive >= TIME_BASED_HOURS_THRESHOLD && netRevenue <= TIME_BASED_LOSS_THRESHOLD) {
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        managerId: campaign.createdBy.id,
        managerEmail: campaign.createdBy.email,
        violationType: 'TIME_BASED_LOSS',
        netRevenue,
        hoursActive,
      };
    }

    return null;
  }

  /**
   * Calculate hours since campaign became active
   */
  calculateHoursActive(launchedAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - launchedAt.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100; // Hours with 2 decimal places
  }

  /**
   * Send stop-loss alert email to the manager
   */
  async sendStopLossAlert(violation: CampaignViolation): Promise<void> {
    // Get manager details
    const manager = await prisma.manager.findUnique({
      where: { id: violation.managerId },
    });

    if (!manager) {
      throw new Error(`Manager not found: ${violation.managerId}`);
    }

    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: violation.campaignId },
      include: { offer: true },
    });

    if (!campaign) {
      throw new Error(`Campaign not found: ${violation.campaignId}`);
    }

    // Send email using the email service
    await emailService.sendStopLossAlert(campaign, manager, {
      type: violation.violationType,
      netRevenue: violation.netRevenue,
      hoursActive: violation.hoursActive ?? undefined,
    });
  }

  /**
   * Acknowledge a stop-loss violation
   */
  async acknowledgeViolation(violationId: string): Promise<boolean> {
    try {
      await prisma.stopLossViolation.update({
        where: { id: violationId },
        data: { acknowledgedAt: new Date() },
      });
      logger.success('stop-loss', `Violation ${violationId} acknowledged`);
      return true;
    } catch (error: any) {
      logger.error('stop-loss', `Failed to acknowledge violation ${violationId}`, { error: error.message });
      return false;
    }
  }

  /**
   * Get violation history for a manager
   */
  async getViolationHistory(managerId: string, limit: number = 50): Promise<any[]> {
    return prisma.stopLossViolation.findMany({
      where: { managerId },
      include: {
        campaign: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

// Export singleton instance
export const stopLossService = new StopLossService();
export default stopLossService;
