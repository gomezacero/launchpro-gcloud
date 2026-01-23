import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { emailService } from '@/services/email.service';
import { CampaignStatus } from '@prisma/client';

/**
 * Cron Job: Process Approved Campaigns
 *
 * Runs every minute via Vercel Cron
 * Processes campaigns with ARTICLE_APPROVED status:
 * - Creates Tonic campaign
 * - Gets tracking link
 * - Generates AI content
 * - Launches to platforms
 */

// Extend Vercel function timeout to 60 seconds (default is 10s)
// This is needed because AI generation can take longer
export const maxDuration = 60;

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
    logger.info('system', '🔄 [CRON] Starting process-campaigns job...');

    // Find all campaigns ready to continue processing
    const approvedCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.ARTICLE_APPROVED,
      },
      include: {
        platforms: true,
        offer: true,
      },
      take: 1, // Process one at a time to avoid timeout
      orderBy: { createdAt: 'asc' }, // FIFO
    });

    if (approvedCampaigns.length === 0) {
      logger.info('system', '✅ [CRON] No approved campaigns to process');
      return NextResponse.json({
        success: true,
        message: 'No campaigns to process',
        processed: 0,
      });
    }

    const campaign = approvedCampaigns[0];
    logger.info('system', `📋 [CRON] Processing campaign "${campaign.name}" (${campaign.id})`);

    // Mark as processing to prevent double-processing
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.GENERATING_AI },
    });

    try {
      // Continue campaign processing after article approval
      const result = await campaignOrchestrator.continueCampaignAfterArticle(campaign.id);

      const duration = Date.now() - startTime;
      logger.success('system', `✅ [CRON] Campaign "${campaign.name}" processed successfully in ${duration}ms`, {
        campaignId: campaign.id,
        platforms: result.platforms,
      });

      // Get updated campaign with all relations for email
      const updatedCampaign = await prisma.campaign.findUnique({
        where: { id: campaign.id },
        include: { platforms: true, offer: true },
      });

      // Send success or partial failure email
      if (updatedCampaign) {
        const allSuccess = result.platforms.every((p: any) => p.success);
        try {
          if (allSuccess) {
            await emailService.sendCampaignSuccess(updatedCampaign);
          } else {
            const failedPlatforms = result.platforms.filter((p: any) => !p.success);
            const errorMsg = failedPlatforms.map((p: any) => `${p.platform}: ${p.error || 'Unknown error'}`).join('; ');
            await emailService.sendCampaignFailed(updatedCampaign, errorMsg);
          }
        } catch (emailError) {
          logger.error('email', `Failed to send campaign email: ${emailError}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Campaign "${campaign.name}" processed successfully`,
        campaignId: campaign.id,
        result,
        duration,
      });

    } catch (processError: any) {
      // Mark campaign as failed
      const failedCampaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'cron-processing',
            message: processError.message,
            timestamp: new Date().toISOString(),
            technicalDetails: processError.stack,
          },
        },
        include: { platforms: true, offer: true },
      });

      logger.error('system', `❌ [CRON] Failed to process campaign "${campaign.name}": ${processError.message}`);

      // Send failure email
      try {
        await emailService.sendCampaignFailed(failedCampaign, processError.message);
      } catch (emailError) {
        logger.error('email', `Failed to send failure email: ${emailError}`);
      }

      return NextResponse.json({
        success: false,
        error: processError.message,
        campaignId: campaign.id,
      }, { status: 500 });
    }

  } catch (error: any) {
    logger.error('system', `❌ [CRON] process-campaigns failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
