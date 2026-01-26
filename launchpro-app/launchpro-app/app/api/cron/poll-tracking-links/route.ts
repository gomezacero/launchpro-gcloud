import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService } from '@/services/tonic.service';
import { campaignAudit } from '@/services/campaign-audit.service';
import { CampaignStatus } from '@prisma/client';

// DEPLOYMENT VERSION - Used to verify which code version is running
const CODE_VERSION = 'v2.2.0-audit-middleware-2026-01-25';

/**
 * Cron Job: Poll Tracking Links
 *
 * Runs every minute via Vercel Cron
 * Checks ALL campaigns in AWAITING_TRACKING status for tracking link availability.
 * NON-BLOCKING: Single check per campaign, updates status if tracking link is ready.
 *
 * This decouples the 10-14 minute tracking link wait from the main processing flow,
 * enabling multiple campaigns to be processed in parallel.
 *
 * Flow:
 * 1. Find all campaigns waiting for tracking links
 * 2. Check each campaign's tracking link status (in parallel)
 * 3. If tracking link ready -> Move to ARTICLE_APPROVED (ready for process-campaigns)
 * 4. If timeout (15 min) -> Mark as FAILED
 * 5. Otherwise -> Keep waiting (will check again next minute)
 */

export const maxDuration = 60; // Lightweight cron, 60 seconds max

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
    console.log(`[poll-tracking-links] CODE_VERSION: ${CODE_VERSION}`);
    logger.info('system', `🔗 [CRON] Starting poll-tracking-links job... (${CODE_VERSION})`);

    // Find all campaigns waiting for tracking links
    const campaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.AWAITING_TRACKING,
        tonicCampaignId: { not: null },
      },
      include: {
        platforms: {
          where: { platform: 'TONIC' },
          include: { tonicAccount: true },
        },
      },
      take: 10, // Process up to 10 campaigns per run
      orderBy: { trackingLinkPollingStartedAt: 'asc' }, // Oldest first
    });

    if (campaigns.length === 0) {
      logger.info('system', '✅ [CRON] No campaigns awaiting tracking links');
      return NextResponse.json({
        success: true,
        message: 'No campaigns awaiting tracking links',
        checked: 0,
      });
    }

    logger.info('system', `📋 [CRON] Found ${campaigns.length} campaign(s) awaiting tracking links`);

    // Check each campaign in parallel (non-blocking)
    const results = await Promise.allSettled(
      campaigns.map(async (campaign) => {
        const tonicAccount = campaign.platforms[0]?.tonicAccount;

        if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
          logger.warn('system', `⚠️ Campaign "${campaign.name}" has no Tonic credentials`);
          return { campaignId: campaign.id, error: 'missing_credentials' };
        }

        const credentials = {
          consumer_key: tonicAccount.tonicConsumerKey,
          consumer_secret: tonicAccount.tonicConsumerSecret,
        };

        try {
          // Single check for tracking link (not a polling loop)
          const statusResult = await tonicService.getCampaignStatus(
            credentials,
            campaign.tonicCampaignId!
          );

          const linkData = statusResult['0'] || statusResult;
          const status = statusResult.status;

          logger.info('tonic', `📡 Campaign "${campaign.name}" - Status: ${status}, Link: ${linkData?.link || 'not ready'}`);

          // Increment polling attempts
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { trackingLinkPollingAttempts: { increment: 1 } },
          });

          // Check if tracking link is ready
          if (status === 'active' && linkData?.link) {
            // Format tracking link
            const protocol = linkData.ssl ? 'https://' : 'http://';
            const trackingLink = linkData.link.startsWith('http')
              ? linkData.link
              : `${protocol}${linkData.link}`;

            // Tracking link ready! Move to ARTICLE_APPROVED
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: CampaignStatus.ARTICLE_APPROVED,
                tonicTrackingLink: trackingLink,
              },
            });

            logger.success('tonic', `✅ Campaign "${campaign.name}" tracking link ready: ${trackingLink}`);

            // AUDIT LOG: Tracking link ready, moving to ARTICLE_APPROVED
            await campaignAudit.logStatusChange(
              campaign.id,
              'cron/poll-tracking-links',
              'AWAITING_TRACKING',
              'ARTICLE_APPROVED',
              `Tracking link received from Tonic: ${trackingLink} - Campaign ready for AI generation`,
              { trackingLink, pollingAttempts: campaign.trackingLinkPollingAttempts + 1 }
            );

            return { campaignId: campaign.id, ready: true, trackingLink };
          }

          // Check for timeout (15 minutes)
          if (campaign.trackingLinkPollingStartedAt) {
            const elapsed = Date.now() - new Date(campaign.trackingLinkPollingStartedAt).getTime();
            const elapsedMinutes = Math.floor(elapsed / 60000);

            if (elapsed > 15 * 60 * 1000) {
              // Timeout - mark as FAILED
              await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                  status: CampaignStatus.FAILED,
                  errorDetails: {
                    step: 'tracking_link_timeout',
                    message: `Tracking link not available after ${elapsedMinutes} minutes polling`,
                    tonicCampaignId: campaign.tonicCampaignId,
                    pollingAttempts: campaign.trackingLinkPollingAttempts + 1,
                    timestamp: new Date().toISOString(),
                  },
                },
              });

              logger.error('tonic', `❌ Campaign "${campaign.name}" TIMEOUT - tracking link not available after ${elapsedMinutes} min`);

              // AUDIT LOG: Tracking link timeout
              await campaignAudit.logStatusChange(
                campaign.id,
                'cron/poll-tracking-links',
                'AWAITING_TRACKING',
                'FAILED',
                `Tracking link timeout after ${elapsedMinutes} minutes - Tonic campaign may have an issue`,
                { elapsedMinutes, pollingAttempts: campaign.trackingLinkPollingAttempts + 1, tonicCampaignId: campaign.tonicCampaignId }
              );

              return { campaignId: campaign.id, timeout: true, elapsedMinutes };
            }

            logger.info('tonic', `⏳ Campaign "${campaign.name}" still waiting (${elapsedMinutes} min elapsed)`);
          }

          return { campaignId: campaign.id, waiting: true };
        } catch (error: any) {
          logger.error('tonic', `❌ Error checking campaign "${campaign.name}": ${error.message}`);
          return { campaignId: campaign.id, error: error.message };
        }
      })
    );

    // Summarize results
    const summary = {
      total: campaigns.length,
      ready: results.filter(r => r.status === 'fulfilled' && (r.value as any).ready).length,
      waiting: results.filter(r => r.status === 'fulfilled' && (r.value as any).waiting).length,
      timeout: results.filter(r => r.status === 'fulfilled' && (r.value as any).timeout).length,
      errors: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && (r.value as any).error)).length,
    };

    const duration = Date.now() - startTime;
    logger.success('system', `✅ [CRON] poll-tracking-links completed in ${duration}ms`, summary);

    return NextResponse.json({
      success: true,
      message: `Checked ${summary.total} campaigns: ${summary.ready} ready, ${summary.waiting} waiting, ${summary.timeout} timeout, ${summary.errors} errors`,
      ...summary,
      duration,
      results: results.map((r, i) => ({
        campaignId: campaigns[i].id,
        campaignName: campaigns[i].name,
        status: r.status,
        result: r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason?.message },
      })),
    });
  } catch (error: any) {
    logger.error('system', `❌ [CRON] poll-tracking-links failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
