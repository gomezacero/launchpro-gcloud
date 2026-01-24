import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { emailService } from '@/services/email.service';
import { CampaignStatus, Prisma } from '@prisma/client';

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
 * SIMPLIFIED APPROACH:
 * - Only process ARTICLE_APPROVED campaigns (no retry of GENERATING_AI)
 * - Validate credentials BEFORE processing (fail fast)
 * - If processing fails, mark as FAILED immediately (no retries)
 * - This prevents orphaned campaigns from blocking the queue
 */

// Extend Vercel function timeout to 120 seconds (Pro plan supports up to 300s)
// Neural Engine + Meta launch requires ~50-60s, so 120s gives comfortable margin
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Debug: Log environment info at the start of cron
    const envDebug = {
      anthropicKeyExists: !!process.env.ANTHROPIC_API_KEY,
      anthropicKeyLength: (process.env.ANTHROPIC_API_KEY || '').length,
      anthropicKeyPreview: process.env.ANTHROPIC_API_KEY
        ? `${(process.env.ANTHROPIC_API_KEY || '').substring(0, 10)}...${(process.env.ANTHROPIC_API_KEY || '').substring(-4)}`
        : 'MISSING',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
    };
    console.log('[CRON process-campaigns] Environment debug:', JSON.stringify(envDebug));
    logger.info('system', '🔄 [CRON] Starting process-campaigns job...', envDebug);

    // Find campaigns to process:
    // 1. ARTICLE_APPROVED - ready for processing
    // 2. GENERATING_AI stuck for more than 5 minutes (timeout recovery)
    // IMPORTANT: Exclude campaigns that already have ACTIVE platforms (already launched successfully)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const campaign = await prisma.campaign.findFirst({
      where: {
        OR: [
          { status: CampaignStatus.ARTICLE_APPROVED },
          {
            status: CampaignStatus.GENERATING_AI,
            updatedAt: { lt: fiveMinutesAgo }
          },
        ],
        // Exclude campaigns that already have platforms in ACTIVE status
        // OR platforms that already have campaign IDs (meaning they were launched)
        // This prevents re-processing of campaigns that succeeded on some platforms
        NOT: {
          platforms: {
            some: {
              OR: [
                { status: CampaignStatus.ACTIVE },
                { metaCampaignId: { not: null } },
                { tiktokCampaignId: { not: null } },
              ],
            },
          },
        },
      },
      include: {
        platforms: {
          include: { tonicAccount: true },
        },
        offer: true,
      },
      orderBy: { createdAt: 'asc' }, // FIFO
    });

    if (!campaign) {
      logger.info('system', '✅ [CRON] No campaigns to process');
      return NextResponse.json({
        success: true,
        message: 'No campaigns to process',
        processed: 0,
      });
    }

    // If this is a stuck GENERATING_AI campaign, log it
    const isRetry = campaign.status === CampaignStatus.GENERATING_AI;
    if (isRetry) {
      logger.info('system', `🔄 [CRON] Retrying stuck campaign "${campaign.name}" (was in GENERATING_AI >5min)`);

      // Additional safety check: verify no platforms are active
      const hasActivePlatforms = campaign.platforms.some(p => p.status === 'ACTIVE');
      if (hasActivePlatforms) {
        // This campaign was partially successful - fix it instead of reprocessing
        logger.info('system', `⚠️ [CRON] Campaign "${campaign.name}" has ACTIVE platforms - fixing status instead of reprocessing`);
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.ACTIVE,
            errorDetails: Prisma.DbNull,
          },
        });
        return NextResponse.json({
          success: true,
          message: `Campaign "${campaign.name}" status fixed to ACTIVE (had active platforms)`,
          campaignId: campaign.id,
          fixed: true,
        });
      }
    }

    logger.info('system', `📋 [CRON] Processing campaign "${campaign.name}" (${campaign.id})`);

    // VALIDATION: Check Tonic credentials BEFORE processing
    const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
    const tonicAccount = tonicPlatform?.tonicAccount;

    if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
      // Missing credentials = permanent failure, don't retry
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'validation',
            message: 'Campaign is missing Tonic credentials. Please check the linked account.',
            timestamp: new Date().toISOString(),
          },
        },
      });
      logger.error('system', `❌ [CRON] Campaign "${campaign.name}" FAILED: Missing Tonic credentials`);
      return NextResponse.json({
        success: false,
        error: 'Missing Tonic credentials',
        campaignId: campaign.id,
      });
    }

    // ATOMIC CLAIM: Use updateMany with status condition to prevent race condition
    // If another process already claimed this campaign (changed status), the update will affect 0 rows
    // NOTE: We only check status, not updatedAt, because:
    // 1. Other operations (media upload, etc.) can update the campaign without claiming it
    // 2. Database-level atomicity ensures only one UPDATE succeeds per row
    // 3. The status check is sufficient - if another cron claimed it, status will be GENERATING_AI
    const claimed = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        status: campaign.status, // Must still be the same status we found (ARTICLE_APPROVED or GENERATING_AI for retries)
      },
      data: {
        status: CampaignStatus.GENERATING_AI,
      },
    });

    // If no rows updated, another process already claimed this campaign (status changed)
    if (claimed.count === 0) {
      logger.info('system', `⏭️ [CRON] Campaign "${campaign.name}" already claimed by another process (status changed), skipping`);
      return NextResponse.json({
        success: true,
        message: 'Campaign already being processed by another instance',
        campaignId: campaign.id,
        skipped: true,
      });
    }

    logger.info('system', `🔒 [CRON] Successfully claimed campaign "${campaign.name}" for processing`);

    try {
      // Process the campaign
      const result = await campaignOrchestrator.continueCampaignAfterArticle(campaign.id);

      const duration = Date.now() - startTime;
      logger.success('system', `✅ [CRON] Campaign "${campaign.name}" processed successfully in ${duration}ms`, {
        campaignId: campaign.id,
        platforms: result.platforms,
      });

      // Get updated campaign for email
      const updatedCampaign = await prisma.campaign.findUnique({
        where: { id: campaign.id },
        include: { platforms: true, offer: true },
      });

      // Send email notification
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
      // SAFETY CHECK: Before marking as FAILED, check if campaign was already launched successfully
      // This prevents race conditions where an error occurs AFTER the campaign was updated to ACTIVE
      const currentState = await prisma.campaign.findUnique({
        where: { id: campaign.id },
        select: { status: true, platforms: { select: { metaCampaignId: true, tiktokCampaignId: true, status: true } } },
      });

      // If campaign is already ACTIVE, or has active platforms with campaign IDs, don't overwrite to FAILED
      const hasSuccessfulLaunch = currentState?.status === CampaignStatus.ACTIVE ||
        currentState?.platforms?.some(p => p.metaCampaignId || p.tiktokCampaignId || p.status === 'ACTIVE');

      if (hasSuccessfulLaunch) {
        logger.warn('system', `⚠️ [CRON] Error occurred but campaign "${campaign.name}" was already launched successfully - NOT overwriting to FAILED`, {
          currentStatus: currentState?.status,
          error: processError.message,
        });
        return NextResponse.json({
          success: true,
          message: `Campaign "${campaign.name}" launched successfully (post-launch error ignored)`,
          campaignId: campaign.id,
          warning: processError.message,
        });
      }

      // Processing failed - mark as FAILED immediately (no retries)
      const failedCampaign = await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'cron-processing',
            message: processError.message,
            timestamp: new Date().toISOString(),
            technicalDetails: processError.stack?.substring(0, 500),
          },
        },
        include: { platforms: true, offer: true },
      });

      logger.error('system', `❌ [CRON] Campaign "${campaign.name}" FAILED: ${processError.message}`);

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
