import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { designflowService } from '@/services/designflow.service';
import { emailService } from '@/services/email.service';
import { CampaignStatus } from '@prisma/client';

/**
 * Cron Job: Sync DesignFlow Task Status
 *
 * Runs every 5 minutes via Vercel Cron
 * Checks campaigns in AWAITING_DESIGN status and syncs their DesignFlow task status.
 * When a task is marked as "Done" in DesignFlow, updates the local status and notifies the user.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without secret
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    logger.info('system', '🎨 [CRON] Starting sync-designflow job...');

    // Find all campaigns waiting for design
    const awaitingDesignCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.AWAITING_DESIGN,
      },
      include: {
        designFlowTask: true,
        offer: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (awaitingDesignCampaigns.length === 0) {
      logger.info('system', '✅ [CRON] No campaigns awaiting design');
      return NextResponse.json({
        success: true,
        message: 'No campaigns awaiting design',
        checked: 0,
        updated: 0,
      });
    }

    logger.info('system', `📋 [CRON] Found ${awaitingDesignCampaigns.length} campaign(s) awaiting design`);

    let updatedCount = 0;
    const results: Array<{
      campaignId: string;
      campaignName: string;
      previousStatus: string;
      newStatus: string;
      updated: boolean;
    }> = [];

    // Check each campaign's DesignFlow task status
    for (const campaign of awaitingDesignCampaigns) {
      if (!campaign.designFlowTask) {
        logger.warn('system', `⚠️ Campaign "${campaign.name}" has no DesignFlow task`);
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          previousStatus: 'N/A',
          newStatus: 'N/A',
          updated: false,
        });
        continue;
      }

      const taskId = campaign.designFlowTask.designflowTaskId;
      const localStatus = campaign.designFlowTask.status;

      try {
        // Fetch current status from DesignFlow
        const externalTask = await designflowService.getTaskById(taskId);

        if (!externalTask) {
          // Task was deleted from DesignFlow - clean up the orphaned campaign
          logger.info('system', `🧹 DesignFlow task ${taskId} not found for campaign "${campaign.name}" - resetting to DRAFT`);

          // Reset campaign to DRAFT so user can re-request design
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: CampaignStatus.DRAFT },
          });

          // Delete the orphaned DesignFlowTask record
          await prisma.designFlowTask.delete({
            where: { id: campaign.designFlowTask.id },
          });

          updatedCount++;
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            previousStatus: localStatus,
            newStatus: 'RESET_TO_DRAFT',
            updated: true,
          });
          continue;
        }

        const externalStatus = externalTask.status;

        // Check if status changed
        if (externalStatus !== localStatus) {
          logger.info('system', `🔄 Status changed for "${campaign.name}": ${localStatus} → ${externalStatus}`);

          // Update local DesignFlowTask
          await prisma.designFlowTask.update({
            where: { id: campaign.designFlowTask.id },
            data: {
              status: externalStatus,
              deliveryLink: externalTask.deliveryLink,
              completedAt: externalStatus === 'Done' ? new Date() : undefined,
            },
          });

          updatedCount++;

          // If task is Done, send notification email
          if (externalStatus === 'Done') {
            logger.success('system', `✅ Design completed for campaign "${campaign.name}"`);

            // Send email notification
            try {
              await emailService.sendDesignComplete(campaign as any, externalTask.deliveryLink || undefined);
              logger.info('email', `Design complete email sent for campaign "${campaign.name}"`);
            } catch (emailError) {
              logger.error('email', `Failed to send design complete email: ${emailError}`);
            }
          }

          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            previousStatus: localStatus,
            newStatus: externalStatus,
            updated: true,
          });
        } else {
          // No change
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            previousStatus: localStatus,
            newStatus: externalStatus,
            updated: false,
          });
        }
      } catch (taskError: any) {
        logger.error('system', `❌ Error checking task ${taskId}: ${taskError.message}`);
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          previousStatus: localStatus,
          newStatus: 'ERROR',
          updated: false,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.success('system', `✅ [CRON] sync-designflow completed in ${duration}ms`, {
      checked: awaitingDesignCampaigns.length,
      updated: updatedCount,
    });

    return NextResponse.json({
      success: true,
      message: `Checked ${awaitingDesignCampaigns.length} campaigns, updated ${updatedCount}`,
      checked: awaitingDesignCampaigns.length,
      updated: updatedCount,
      results,
      duration,
    });

  } catch (error: any) {
    logger.error('system', `❌ [CRON] sync-designflow failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
