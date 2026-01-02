import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService } from '@/services/tonic.service';
import { designflowService } from '@/services/designflow.service';
import { emailService } from '@/services/email.service';
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
      // Note: designFlowRequester and designFlowNotes are included by default (scalar fields)
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
          // Article approved! Now create Tonic campaign and send to DesignFlow
          logger.info('tonic', `✅ [CRON] Article approved for "${campaign.name}", creating Tonic campaign...`);

          try {
            // 1. Create campaign in Tonic with the approved headline
            const tonicCampaignId = await tonicService.createCampaign(credentials, {
              name: campaign.name,
              offer_id: campaign.offerId,
              country: campaign.country,
              type: 'rsoc',
              headline_id: articleStatus.headline_id,
              return_type: 'id',
            });

            logger.info('tonic', `📦 [CRON] Tonic campaign created: ${tonicCampaignId}`);

            // 2. Get tracking link and direct_link from campaign list
            let trackingLink: string | null = null;
            let directLink: string | null = null;

            // Wait a moment for Tonic to process, then fetch campaign details
            await new Promise(resolve => setTimeout(resolve, 2000));

            const campaignList = await tonicService.getCampaignList(credentials, 'active');
            const tonicCampaign = campaignList.find((c: { id: string | number }) =>
              String(c.id) === String(tonicCampaignId)
            );

            if (tonicCampaign) {
              trackingLink = tonicCampaign.link || null;
              directLink = tonicCampaign.direct_link || null;
              logger.info('tonic', `🔗 [CRON] Got links - tracking: ${trackingLink}, direct: ${directLink}`);
            }

            // 3. Prepare reference links for DesignFlow
            const referenceLinks: string[] = [];
            if (trackingLink) {
              // Add https:// if not present
              const fullTrackingLink = trackingLink.startsWith('http')
                ? trackingLink
                : `https://${trackingLink}`;
              referenceLinks.push(fullTrackingLink);
            }
            if (directLink) {
              referenceLinks.push(directLink);
            }

            // 4. Create DesignFlow task automatically
            logger.info('system', `🎨 [CRON] Creating DesignFlow task for "${campaign.name}"...`);

            const designFlowTask = await designflowService.createTask({
              campaignName: campaign.name,
              campaignId: campaign.id,
              offerId: campaign.offerId,
              offerName: campaign.offer?.name,
              country: campaign.country,
              language: campaign.language,
              platforms: campaign.platforms.map(p => p.platform),
              copyMaster: campaign.copyMaster || undefined,
              requester: campaign.designFlowRequester || 'Harry',
              priority: 'Normal',
              referenceLinks,
              additionalNotes: campaign.designFlowNotes || undefined,
            });

            logger.success('system', `✅ [CRON] DesignFlow task created: ${designFlowTask.id}`);

            // 5. Save DesignFlowTask record in database
            await prisma.designFlowTask.create({
              data: {
                campaignId: campaign.id,
                designflowTaskId: designFlowTask.id,
                status: designFlowTask.status,
                title: designFlowTask.title,
                requester: campaign.designFlowRequester || 'Harry',
              },
            });

            // 6. Update campaign with all data and change status to AWAITING_DESIGN
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: CampaignStatus.AWAITING_DESIGN,
                tonicCampaignId: String(tonicCampaignId),
                tonicArticleId: articleStatus.headline_id,
                tonicTrackingLink: trackingLink,
                tonicDirectLink: directLink,
              },
            });

            logger.success('system', `🚀 [CRON] Campaign "${campaign.name}" fully processed: Article approved → Tonic campaign created → DesignFlow task created → Status: AWAITING_DESIGN`);

            results.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              status: 'approved',
              action: `Article approved, Tonic campaign created (${tonicCampaignId}), DesignFlow task created (${designFlowTask.id}), status: AWAITING_DESIGN`,
            });

          } catch (processingError: unknown) {
            // If processing fails after approval, save partial progress
            const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error';
            logger.error('system', `❌ [CRON] Error processing approved article for "${campaign.name}": ${errorMessage}`);

            // Save the article approval at least, so we can retry later
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                status: CampaignStatus.ARTICLE_APPROVED, // Fallback status for retry
                tonicArticleId: articleStatus.headline_id,
                errorDetails: {
                  step: 'post-article-processing',
                  message: errorMessage,
                  timestamp: new Date().toISOString(),
                },
              },
            });

            results.push({
              campaignId: campaign.id,
              campaignName: campaign.name,
              status: 'partial',
              action: `Article approved but processing failed: ${errorMessage}. Status: ARTICLE_APPROVED for retry.`,
            });
          }

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

          // Send email notification for rejected article
          try {
            await emailService.sendArticleRejected(campaign, articleStatus.rejection_reason || 'No reason provided');
          } catch (emailError) {
            logger.error('email', `Failed to send article rejected email: ${emailError}`);
          }

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

            // Send email notification for timeout
            try {
              await emailService.sendArticleTimeout(campaign);
            } catch (emailError) {
              logger.error('email', `Failed to send article timeout email: ${emailError}`);
            }

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
