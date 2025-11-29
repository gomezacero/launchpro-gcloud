import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService } from '@/services/tonic.service';
import { CampaignStatus } from '@prisma/client';

/**
 * Cron Job: Check Article Approval Status
 *
 * Runs every minute via Vercel Cron
 * Checks all campaigns with PENDING_ARTICLE status and updates them when approved/rejected
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
    logger.info('system', '🔄 [CRON] Starting check-articles job...');

    // Find all campaigns waiting for article approval
    const pendingCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.PENDING_ARTICLE,
        tonicArticleRequestId: { not: null },
      },
      include: {
        platforms: {
          where: { platform: 'TONIC' },
          include: { tonicAccount: true },
        },
        offer: true,
      },
    });

    if (pendingCampaigns.length === 0) {
      logger.info('system', '✅ [CRON] No pending article campaigns to check');
      return NextResponse.json({
        success: true,
        message: 'No pending campaigns',
        processed: 0,
      });
    }

    logger.info('system', `📋 [CRON] Found ${pendingCampaigns.length} campaigns waiting for article approval`);

    const results: Array<{
      campaignId: string;
      campaignName: string;
      status: string;
      action: string;
    }> = [];

    for (const campaign of pendingCampaigns) {
      try {
        // Get Tonic account from platforms
        const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
        const tonicAccount = tonicPlatform?.tonicAccount;

        if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
          logger.warn('system', `⚠️ [CRON] Campaign ${campaign.name} missing Tonic credentials, skipping`);
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: 'skipped',
            action: 'Missing Tonic credentials',
          });
          continue;
        }

        const credentials = {
          consumer_key: tonicAccount.tonicConsumerKey,
          consumer_secret: tonicAccount.tonicConsumerSecret,
        };

        // Check article status
        const requestId = parseInt(campaign.tonicArticleRequestId!);
        logger.info('tonic', `🔍 [CRON] Checking article request #${requestId} for campaign "${campaign.name}"`);

        const articleStatus = await tonicService.getArticleRequest(credentials, requestId);

        logger.info('tonic', `📄 [CRON] Article status: ${articleStatus.request_status}`, {
          campaignId: campaign.id,
          requestId,
          headlineId: articleStatus.headline_id,
        });

        if (articleStatus.request_status === 'published') {
          // Article approved! Update campaign
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: CampaignStatus.ARTICLE_APPROVED,
              tonicArticleId: articleStatus.headline_id,
            },
          });

          logger.success('system', `✅ [CRON] Campaign "${campaign.name}" article approved! headline_id: ${articleStatus.headline_id}`);
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: 'approved',
            action: `Updated to ARTICLE_APPROVED, headline_id: ${articleStatus.headline_id}`,
          });

        } else if (articleStatus.request_status === 'rejected') {
          // Article rejected! Mark campaign as failed
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: {
              status: CampaignStatus.FAILED,
              errorDetails: {
                step: 'article-approval',
                message: `Article rejected: ${articleStatus.rejection_reason || 'No reason provided'}`,
                timestamp: new Date().toISOString(),
              },
            },
          });

          logger.warn('system', `❌ [CRON] Campaign "${campaign.name}" article rejected: ${articleStatus.rejection_reason}`);
          results.push({
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: 'rejected',
            action: `Marked as FAILED: ${articleStatus.rejection_reason}`,
          });

        } else {
          // Still pending or in review
          const createdAt = new Date(campaign.createdAt);
          const hoursElapsed = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);

          // If waiting for more than 24 hours, mark as failed
          if (hoursElapsed > 24) {
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: CampaignStatus.FAILED,
                errorDetails: {
                  step: 'article-approval',
                  message: 'Article approval timeout: waited more than 24 hours',
                  timestamp: new Date().toISOString(),
                },
              },
            });

            logger.warn('system', `⏰ [CRON] Campaign "${campaign.name}" timed out waiting for article approval (${hoursElapsed.toFixed(1)} hours)`);
            results.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              status: 'timeout',
              action: 'Marked as FAILED after 24h timeout',
            });
          } else {
            results.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              status: 'pending',
              action: `Still waiting (${hoursElapsed.toFixed(1)} hours elapsed)`,
            });
          }
        }
      } catch (error: any) {
        logger.error('system', `❌ [CRON] Error checking campaign ${campaign.name}: ${error.message}`);
        results.push({
          campaignId: campaign.id,
          campaignName: campaign.name,
          status: 'error',
          action: error.message,
        });
      }
    }

    const duration = Date.now() - startTime;
    logger.success('system', `✅ [CRON] check-articles completed in ${duration}ms`, {
      processed: pendingCampaigns.length,
      results,
    });

    return NextResponse.json({
      success: true,
      message: `Processed ${pendingCampaigns.length} campaigns`,
      processed: pendingCampaigns.length,
      results,
      duration,
    });

  } catch (error: any) {
    logger.error('system', `❌ [CRON] check-articles failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
