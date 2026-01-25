import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { emailService } from '@/services/email.service';
import { CampaignStatus, Prisma, Campaign, CampaignPlatform, Offer, Account } from '@prisma/client';

/**
 * Cron Job: Process Approved Campaigns (PARALLEL PROCESSING)
 *
 * Runs every minute via Vercel Cron
 * Processes UP TO 3 campaigns with ARTICLE_APPROVED status IN PARALLEL:
 * - Generates AI content
 * - Launches to platforms (Meta/TikTok)
 *
 * IMPORTANT: This cron ONLY processes campaigns that ALREADY have tracking links ready.
 * The poll-tracking-links cron handles waiting for tracking links and moves campaigns
 * to ARTICLE_APPROVED when the tracking link is available.
 *
 * PARALLEL PROCESSING APPROACH:
 * - Uses findMany to get up to 3 campaigns
 * - Uses Promise.allSettled to process them in parallel
 * - Each campaign has its own atomic claim to prevent race conditions
 * - Failures in one campaign don't affect others
 */

// Extend Vercel function timeout to 800 seconds (Pro plan max)
// With parallel processing (no tracking link wait), this is plenty of time
export const maxDuration = 800;

// Type for campaign with includes
type CampaignWithIncludes = Campaign & {
  platforms: (CampaignPlatform & { tonicAccount: Account | null })[];
  offer: Offer;
};

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
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    const envDebug = {
      anthropicKeyExists: !!apiKey,
      anthropicKeyLength: apiKey.length,
      anthropicKeyPreview: apiKey
        ? `${apiKey.substring(0, 10)}...${apiKey.slice(-4)}`
        : 'MISSING',
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
    };
    console.log('[CRON process-campaigns] Environment debug:', JSON.stringify(envDebug));
    logger.info('system', '🔄 [CRON] Starting process-campaigns job (PARALLEL MODE)...', envDebug);

    // VALIDATION: Check Anthropic API key BEFORE processing (fail fast for ALL campaigns)
    if (!apiKey || apiKey.length < 50 || !apiKey.startsWith('sk-ant-')) {
      logger.error('system', `❌ [CRON] CRITICAL: Anthropic API key is invalid or missing!`, {
        keyLength: apiKey.length,
        keyStart: apiKey.substring(0, 10) || 'EMPTY',
        startsWithSkAnt: apiKey.startsWith('sk-ant-'),
      });
      return NextResponse.json({
        success: false,
        error: 'Anthropic API key is invalid or missing. Please check ANTHROPIC_API_KEY environment variable.',
        systemError: true,
      }, { status: 500 });
    }

    // Find MULTIPLE campaigns ready to process (up to 3 for parallel processing)
    // CRITICAL: Only process campaigns that ALREADY have tracking links
    // The poll-tracking-links cron handles waiting for tracking links
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    const campaigns = await prisma.campaign.findMany({
      where: {
        OR: [
          {
            status: CampaignStatus.ARTICLE_APPROVED,
            // CRITICAL: Must have a real tracking link (not placeholder)
            tonicTrackingLink: { not: null },
            NOT: {
              tonicTrackingLink: { contains: 'tracking-pending' },
            },
          },
          {
            // Retry stuck GENERATING_AI campaigns (timeout recovery)
            status: CampaignStatus.GENERATING_AI,
            updatedAt: { lt: fifteenMinutesAgo },
          },
        ],
        // Exclude campaigns that already have platforms launched
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
      take: 3, // Process up to 3 campaigns in parallel
    });

    if (campaigns.length === 0) {
      logger.info('system', '✅ [CRON] No campaigns ready to process');
      return NextResponse.json({
        success: true,
        message: 'No campaigns ready to process',
        processed: 0,
      });
    }

    logger.info('system', `📋 [CRON] Found ${campaigns.length} campaign(s) ready for PARALLEL processing`, {
      campaigns: campaigns.map(c => ({ id: c.id, name: c.name, status: c.status })),
    });

    // Process campaigns IN PARALLEL using Promise.allSettled
    // Each campaign processes independently - failures don't affect others
    const results = await Promise.allSettled(
      campaigns.map(campaign => processSingleCampaign(campaign as CampaignWithIncludes, startTime))
    );

    // Summarize results
    const summary = {
      total: campaigns.length,
      succeeded: results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !(r.value as any).success)).length,
      skipped: results.filter(r => r.status === 'fulfilled' && (r.value as any).skipped).length,
    };

    const duration = Date.now() - startTime;
    logger.success('system', `✅ [CRON] process-campaigns completed in ${duration}ms`, {
      ...summary,
      campaignResults: results.map((r, i) => ({
        campaignId: campaigns[i].id,
        campaignName: campaigns[i].name,
        status: r.status,
        result: r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason?.message },
      })),
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${summary.total} campaigns: ${summary.succeeded} succeeded, ${summary.failed} failed, ${summary.skipped} skipped`,
      processed: summary.total,
      ...summary,
      duration,
      results: results.map((r, i) => ({
        campaignId: campaigns[i].id,
        campaignName: campaigns[i].name,
        status: r.status === 'fulfilled' ? (r.value as any).success ? 'success' : 'failed' : 'error',
        result: r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason?.message },
      })),
    });

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

/**
 * Process a single campaign with atomic claiming and error handling
 */
async function processSingleCampaign(
  campaign: CampaignWithIncludes,
  cronStartTime: number
): Promise<{ success: boolean; skipped?: boolean; campaignId: string; message: string; result?: any }> {
  const campaignStartTime = Date.now();

  try {
    // ============================================
    // SAFETY CHECK: Skip campaigns that already have platform launches
    // ============================================
    const existingPlatformLaunches = campaign.platforms.filter(p =>
      p.metaCampaignId || p.tiktokCampaignId || p.status === 'ACTIVE'
    );

    if (existingPlatformLaunches.length > 0) {
      logger.info('system', `⏭️ [CRON] Campaign "${campaign.name}" already has platform launches, fixing status`, {
        platforms: existingPlatformLaunches.map(p => ({
          platform: p.platform,
          metaCampaignId: p.metaCampaignId,
          tiktokCampaignId: p.tiktokCampaignId,
          status: p.status,
        })),
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.ACTIVE,
          errorDetails: Prisma.DbNull,
        },
      });

      return {
        success: true,
        skipped: true,
        campaignId: campaign.id,
        message: 'Already launched - status fixed to ACTIVE',
      };
    }

    // ============================================
    // VALIDATION: Check Tonic credentials
    // ============================================
    const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
    const tonicAccount = tonicPlatform?.tonicAccount;

    if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
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
      return {
        success: false,
        campaignId: campaign.id,
        message: 'Missing Tonic credentials',
      };
    }

    // ============================================
    // VALIDATION: Check tracking link is ready
    // ============================================
    if (!campaign.tonicTrackingLink || campaign.tonicTrackingLink.includes('tracking-pending')) {
      logger.warn('system', `⏭️ [CRON] Campaign "${campaign.name}" tracking link not ready, skipping (should be in AWAITING_TRACKING)`);
      return {
        success: true,
        skipped: true,
        campaignId: campaign.id,
        message: 'Tracking link not ready - skipping',
      };
    }

    // ============================================
    // ATOMIC CLAIM: Prevent race conditions
    // ============================================
    const isRetry = campaign.status === CampaignStatus.GENERATING_AI;
    if (isRetry) {
      logger.info('system', `🔄 [CRON] Retrying stuck campaign "${campaign.name}" (was in GENERATING_AI >15min)`);
    }

    const claimed = await prisma.campaign.updateMany({
      where: {
        id: campaign.id,
        status: campaign.status, // Must still be the same status
      },
      data: {
        status: CampaignStatus.GENERATING_AI,
      },
    });

    if (claimed.count === 0) {
      logger.info('system', `⏭️ [CRON] Campaign "${campaign.name}" already claimed by another process`);
      return {
        success: true,
        skipped: true,
        campaignId: campaign.id,
        message: 'Already claimed by another process',
      };
    }

    logger.info('system', `🔒 [CRON] Claimed campaign "${campaign.name}" for processing`);

    // DEBUG: Log ANTHROPIC_API_KEY status before processing
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    logger.info('system', `🔑 [CRON] ANTHROPIC_API_KEY check BEFORE continueCampaignAfterArticle: length=${apiKey.length}, starts_with_sk-ant=${apiKey.startsWith('sk-ant-')}, preview=${apiKey.substring(0,15)}...${apiKey.substring(apiKey.length-6)}`);

    // ============================================
    // PROCESS THE CAMPAIGN
    // ============================================
    logger.info('system', `🚀 [CRON] CALLING continueCampaignAfterArticle for "${campaign.name}" NOW...`);
    const result = await campaignOrchestrator.continueCampaignAfterArticle(campaign.id);
    logger.info('system', `✅ [CRON] continueCampaignAfterArticle RETURNED for "${campaign.name}"`)

    const duration = Date.now() - campaignStartTime;
    logger.success('system', `✅ [CRON] Campaign "${campaign.name}" processed in ${duration}ms`, {
      campaignId: campaign.id,
      platforms: result.platforms,
    });

    // Clear any stale errors for successful launches
    const allPlatformsSuccess = result.platforms.every((p: any) => p.success);
    if (allPlatformsSuccess) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { errorDetails: Prisma.DbNull },
      });
    }

    // Send email notification
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      include: { platforms: true, offer: true },
    });

    if (updatedCampaign) {
      try {
        if (allPlatformsSuccess) {
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

    return {
      success: true,
      campaignId: campaign.id,
      message: `Processed successfully in ${duration}ms`,
      result,
    };

  } catch (processError: any) {
    // ============================================
    // ERROR HANDLING: Check if campaign was actually launched
    // ============================================
    const currentState = await prisma.campaign.findUnique({
      where: { id: campaign.id },
      select: {
        status: true,
        tonicCampaignId: true,
        tonicTrackingLink: true,
        launchedAt: true,
        platforms: { select: { metaCampaignId: true, tiktokCampaignId: true, status: true } },
      },
    });

    const hasPlatformLaunch = currentState?.platforms?.some(p =>
      p.metaCampaignId || p.tiktokCampaignId || p.status === 'ACTIVE'
    );
    const hasRealTrackingLink = currentState?.tonicTrackingLink &&
      !currentState.tonicTrackingLink.includes('tracking-pending');

    const hasSuccessfulLaunch = currentState?.status === CampaignStatus.ACTIVE ||
      hasPlatformLaunch ||
      currentState?.launchedAt !== null ||
      hasRealTrackingLink;

    if (hasSuccessfulLaunch) {
      logger.warn('system', `⚠️ [CRON] Error occurred but campaign "${campaign.name}" was already launched - preserving ACTIVE`, {
        error: processError.message,
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.ACTIVE,
          errorDetails: Prisma.DbNull,
        },
      });

      return {
        success: true,
        campaignId: campaign.id,
        message: 'Already launched (post-launch error ignored)',
      };
    }

    // Processing failed - mark as FAILED
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

    return {
      success: false,
      campaignId: campaign.id,
      message: processError.message,
    };
  }
}
