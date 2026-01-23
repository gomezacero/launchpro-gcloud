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
 *
 * Also retries campaigns stuck in GENERATING_AI for more than 5 minutes
 * (handles timeout/crash recovery scenarios)
 */

// Extend Vercel function timeout to 60 seconds (default is 10s)
// This is needed because AI generation can take longer
export const maxDuration = 60;

// Time threshold for considering a GENERATING_AI campaign as stuck (5 minutes)
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

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

    // Calculate threshold time for stuck campaigns
    const stuckThreshold = new Date(Date.now() - STUCK_THRESHOLD_MS);

    // Find campaigns to process:
    // 1. ARTICLE_APPROVED - ready for processing
    // 2. GENERATING_AI that has been stuck for more than 5 minutes (timeout recovery)
    const campaignsToProcess = await prisma.campaign.findMany({
      where: {
        OR: [
          // Normal path: approved and ready
          { status: CampaignStatus.ARTICLE_APPROVED },
          // Recovery path: stuck in GENERATING_AI (timed out or crashed)
          {
            status: CampaignStatus.GENERATING_AI,
            updatedAt: { lt: stuckThreshold },
          },
        ],
      },
      include: {
        platforms: true,
        offer: true,
      },
      take: 1, // Process one at a time to avoid timeout
      orderBy: { createdAt: 'asc' }, // FIFO
    });

    if (campaignsToProcess.length === 0) {
      logger.info('system', '✅ [CRON] No campaigns to process');
      return NextResponse.json({
        success: true,
        message: 'No campaigns to process',
        processed: 0,
      });
    }

    const campaign = campaignsToProcess[0];
    const isRetry = campaign.status === CampaignStatus.GENERATING_AI;

    // Check retry count from errorDetails to prevent infinite loops
    const errorDetails = campaign.errorDetails as any;
    const retryCount = errorDetails?.retryCount || 0;
    const MAX_RETRIES = 3;

    if (isRetry) {
      if (retryCount >= MAX_RETRIES) {
        // Too many retries, mark as failed
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.FAILED,
            errorDetails: {
              ...errorDetails,
              step: 'cron-processing',
              message: `Campaign failed after ${MAX_RETRIES} retry attempts`,
              timestamp: new Date().toISOString(),
            },
          },
        });
        logger.error('system', `❌ [CRON] Campaign "${campaign.name}" exceeded max retries (${MAX_RETRIES}), marked as FAILED`);
        return NextResponse.json({
          success: false,
          message: `Campaign "${campaign.name}" exceeded max retries`,
          campaignId: campaign.id,
        });
      }
      logger.info('system', `🔄 [CRON] Retrying stuck campaign "${campaign.name}" (attempt ${retryCount + 1}/${MAX_RETRIES})`);
    }
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
      const newRetryCount = retryCount + 1;
      const shouldRetry = newRetryCount < MAX_RETRIES;

      // If retries remaining, keep in GENERATING_AI for retry; otherwise mark as FAILED
      const failedCampaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: shouldRetry ? CampaignStatus.GENERATING_AI : CampaignStatus.FAILED,
          errorDetails: {
            step: 'cron-processing',
            message: processError.message,
            timestamp: new Date().toISOString(),
            technicalDetails: processError.stack?.substring(0, 500),
            retryCount: newRetryCount,
            lastError: processError.message,
          },
        },
        include: { platforms: true, offer: true },
      });

      if (shouldRetry) {
        logger.warn('system', `⚠️ [CRON] Campaign "${campaign.name}" failed (attempt ${newRetryCount}/${MAX_RETRIES}), will retry: ${processError.message}`);
      } else {
        logger.error('system', `❌ [CRON] Campaign "${campaign.name}" failed after ${MAX_RETRIES} attempts: ${processError.message}`);
      }

      // Only send failure email on final failure (no more retries)
      if (!shouldRetry) {
        try {
          await emailService.sendCampaignFailed(failedCampaign, processError.message);
        } catch (emailError) {
          logger.error('email', `Failed to send failure email: ${emailError}`);
        }
      }

      return NextResponse.json({
        success: false,
        error: processError.message,
        campaignId: campaign.id,
        willRetry: shouldRetry,
        retryCount: newRetryCount,
      }, { status: shouldRetry ? 200 : 500 });
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
