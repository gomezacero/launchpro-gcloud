import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { emailService } from '@/services/email.service';
import { campaignAudit } from '@/services/campaign-audit.service';
import { CampaignStatus, Prisma, Campaign, CampaignPlatform, Offer, Account } from '@prisma/client';

// DEPLOYMENT VERSION - Used to verify which code version is running
// This helps identify if old Vercel instances are executing stale code
// v2.9.0: Removed duplicate old code, all AI uses Gemini exclusively
const CODE_VERSION = 'v2.9.0-NO-ANTHROPIC';

// MODULE LOAD LOG - This executes when the module is imported
console.log(`\n\n${'='.repeat(80)}`);
console.log(`🔍🔍🔍 CRON MODULE LOADED - VERSION: ${CODE_VERSION} 🔍🔍🔍`);
console.log(`🔍🔍🔍 All AI generation uses GEMINI exclusively 🔍🔍🔍`);
console.log(`${'='.repeat(80)}\n\n`);

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
  // ====== ULTRA DEBUG: First thing in the function ======
  const cronInstanceId = `PC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  console.log(`\n\n========== [process-campaigns] CRON INVOKED ==========`);
  console.log(`[process-campaigns] CODE_VERSION: ${CODE_VERSION}`);
  console.log(`[process-campaigns] Instance ID: ${cronInstanceId}`);
  console.log(`[process-campaigns] Timestamp: ${new Date().toISOString()}`);
  console.log(`[process-campaigns] ENV CHECK: GEMINI_API_KEY exists=${!!process.env.GEMINI_API_KEY}`);
  console.log(`[process-campaigns] ENV CHECK: CRON_SECRET exists=${!!process.env.CRON_SECRET}`);
  console.log(`=======================================================\n\n`);
  // ====== END ULTRA DEBUG ======

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
    // v2.9.0: All AI uses Gemini - no Anthropic validation needed
    const envDebug = {
      geminiKeyExists: !!process.env.GEMINI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7),
      aiProvider: 'GEMINI-ONLY-v2.9.0',
    };
    console.log('[CRON process-campaigns] Environment debug:', JSON.stringify(envDebug));
    logger.info('system', '🔄 [CRON] Starting process-campaigns job (PARALLEL MODE)...', envDebug);

    // Find MULTIPLE campaigns ready to process (up to 3 for parallel processing)
    // CRITICAL: Only process campaigns that ALREADY have tracking links
    // The poll-tracking-links cron handles waiting for tracking links
    const campaigns = await prisma.campaign.findMany({
      where: {
        // ONLY process campaigns that are ARTICLE_APPROVED with a valid tracking link
        // NO automatic retry for GENERATING_AI - if it fails, it stays failed
        status: CampaignStatus.ARTICLE_APPROVED,
        // CRITICAL: Must have a real tracking link (not placeholder)
        tonicTrackingLink: { not: null },
        AND: [
          {
            NOT: {
              tonicTrackingLink: { contains: 'tracking-pending' },
            },
          },
          {
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
        ],
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

    // ULTRA DEBUG: Log query result
    console.log(`[process-campaigns] Query result: found ${campaigns.length} campaigns`);
    campaigns.forEach((c, i) => {
      console.log(`[process-campaigns] Campaign ${i + 1}: id=${c.id}, name="${c.name}", status=${c.status}`);
    });

    if (campaigns.length === 0) {
      console.log(`[process-campaigns] No campaigns found, returning early`);
      logger.info('system', '✅ [CRON] No campaigns ready to process');
      return NextResponse.json({
        success: true,
        message: 'No campaigns ready to process',
        processed: 0,
      });
    }

    console.log(`[process-campaigns] About to process ${campaigns.length} campaign(s)`);
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
  // ULTRA DEBUG: Entry to processSingleCampaign
  const processId = `PSC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  console.log(`\n[processSingleCampaign] ======== ENTERED ========`);
  console.log(`[processSingleCampaign] Process ID: ${processId}`);
  console.log(`[processSingleCampaign] Campaign: "${campaign.name}" (${campaign.id})`);
  console.log(`[processSingleCampaign] Status: ${campaign.status}`);
  console.log(`[processSingleCampaign] Tracking Link: ${campaign.tonicTrackingLink || 'NONE'}`);
  console.log(`[processSingleCampaign] ANTHROPIC_API_KEY length: ${(process.env.ANTHROPIC_API_KEY || '').length}`);
  console.log(`[processSingleCampaign] ===========================\n`);

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

    // ULTRA DEBUG: Claimed successfully
    console.log(`\n[processSingleCampaign] ✅ CLAIMED campaign "${campaign.name}" for processing`);
    console.log(`[processSingleCampaign] Status set to GENERATING_AI`);

    // AUDIT LOG: Starting AI generation
    await campaignAudit.logStatusChange(
      campaign.id,
      'cron/process-campaigns',
      'ARTICLE_APPROVED',
      'GENERATING_AI',
      `Campaign claimed for processing - starting AI content generation`,
      { processId, trackingLink: campaign.tonicTrackingLink }
    );
    logger.info('system', `🔒 [CRON] Claimed campaign "${campaign.name}" for processing`);

    // DEBUG: Log ANTHROPIC_API_KEY status before processing
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    console.log(`\n[processSingleCampaign] 🔑 API KEY CHECK:`);
    console.log(`[processSingleCampaign]   - Length: ${apiKey.length}`);
    console.log(`[processSingleCampaign]   - Starts with sk-ant-: ${apiKey.startsWith('sk-ant-')}`);
    console.log(`[processSingleCampaign]   - Preview: ${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 6)}`);
    logger.info('system', `🔑 [CRON] ANTHROPIC_API_KEY check BEFORE continueCampaignAfterArticle: length=${apiKey.length}, starts_with_sk-ant=${apiKey.startsWith('sk-ant-')}, preview=${apiKey.substring(0,15)}...${apiKey.substring(apiKey.length-6)}`);

    // ============================================
    // PROCESS THE CAMPAIGN
    // ============================================
    console.log(`\n[processSingleCampaign] 🚀 ABOUT TO CALL continueCampaignAfterArticle...`);
    console.log(`[processSingleCampaign] CODE_VERSION: ${CODE_VERSION}`);
    console.log(`[processSingleCampaign] Campaign ID: ${campaign.id}`);
    console.log(`[processSingleCampaign] Timestamp: ${new Date().toISOString()}`);
    console.log(`[processSingleCampaign] API Key Preview: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 6)}`);
    logger.info('system', `🚀 [CRON] CALLING continueCampaignAfterArticle for "${campaign.name}" NOW... (${CODE_VERSION})`);

    // CRITICAL AUDIT LOG: Verify cron is running new code
    await campaignAudit.log(campaign.id, {
      event: 'CRON_PROCESS',
      source: `cron/process-campaigns (${CODE_VERSION})`,
      message: `🚀 CRON: About to call continueCampaignAfterArticle - VERSION: ${CODE_VERSION}`,
      details: {
        version: CODE_VERSION,
        timestamp: new Date().toISOString(),
        anthropicKeyLength: apiKey.length,
        aiProvider: 'GEMINI (should NOT use Anthropic)',
      },
    });

    const result = await campaignOrchestrator.continueCampaignAfterArticle(campaign.id);

    console.log(`\n[processSingleCampaign] ✅ continueCampaignAfterArticle RETURNED`);
    console.log(`[processSingleCampaign] Result:`, JSON.stringify(result, null, 2));
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

      // AUDIT LOG: Campaign launched successfully
      await campaignAudit.logStatusChange(
        campaign.id,
        'cron/process-campaigns',
        'GENERATING_AI',
        'ACTIVE',
        `Campaign successfully launched to ${result.platforms.map((p: any) => p.platform).join(', ')}`,
        { durationMs: duration, platforms: result.platforms }
      );
    } else {
      // AUDIT LOG: Partial success
      const failedPlatforms = result.platforms.filter((p: any) => !p.success);
      await campaignAudit.logError(
        campaign.id,
        'cron/process-campaigns',
        new Error(`Some platforms failed: ${failedPlatforms.map((p: any) => p.platform).join(', ')}`),
        'Partial launch failure',
        { durationMs: duration, platforms: result.platforms }
      );
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

    // AUDIT LOG: Campaign processing failed
    await campaignAudit.logError(
      campaign.id,
      'cron/process-campaigns',
      processError,
      'Campaign processing failed during AI generation or platform launch',
      {
        durationMs: Date.now() - campaignStartTime,
        errorStatus: processError.status,
        errorType: processError.constructor?.name,
      }
    );

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
