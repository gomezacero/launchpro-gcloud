import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService } from '@/services/tonic.service';
import { designflowService } from '@/services/designflow.service';
import { emailService } from '@/services/email.service';
import { campaignAudit } from '@/services/campaign-audit.service';
import { CampaignStatus } from '@prisma/client';

// DEPLOYMENT VERSION - Used to verify which code version is running
const CODE_VERSION = 'v2.2.0-audit-middleware-2026-01-25';

/**
 * Cron Job: Check Article Approval Status
 *
 * Runs every minute via Vercel Cron
 * Checks all campaigns with PENDING_ARTICLE status and updates them when approved/rejected
 */

// Extend Vercel function timeout to 60 seconds (default is 10s)
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
    console.log(`[check-articles] CODE_VERSION: ${CODE_VERSION}`);
    logger.info('system', `🔄 [CRON] Starting check-articles job... (${CODE_VERSION})`);

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

          // Declare tonicCampaignId outside try block so it's available in catch
          // This allows us to save the ID even if subsequent steps fail
          let tonicCampaignId: string | number | null = null;

          try {
            // 1. Create campaign in Tonic with the approved headline
            // IMPORTANT: Use campaign.offer.tonicId (numeric Tonic ID), NOT campaign.offerId (LaunchPro CUID)
            tonicCampaignId = await tonicService.createCampaign(credentials, {
              name: campaign.name,
              offer_id: campaign.offer?.tonicId || campaign.offerId, // Use Tonic's offer ID
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

            // Try multiple states since new campaigns might be in pending/incomplete
            const statesToCheck: Array<'active' | 'pending' | 'incomplete'> = ['active', 'pending', 'incomplete'];
            let tonicCampaign: any = null;

            for (const state of statesToCheck) {
              if (tonicCampaign) break;
              try {
                const campaignList = await tonicService.getCampaignList(credentials, state);
                tonicCampaign = campaignList.find((c: { id: string | number }) =>
                  String(c.id) === String(tonicCampaignId)
                );
                if (tonicCampaign) {
                  logger.info('tonic', `🔗 [CRON] Found campaign in '${state}' state`);
                }
              } catch (listError) {
                logger.warn('tonic', `Could not fetch ${state} campaigns: ${listError}`);
              }
            }

            if (tonicCampaign) {
              trackingLink = tonicCampaign.link || null;
              directLink = tonicCampaign.direct_link || null;
              logger.info('tonic', `🔗 [CRON] Got links - tracking: ${trackingLink}, direct: ${directLink}`);
            } else {
              // Fallback: try getCampaignStatus endpoint
              try {
                const campaignStatus = await tonicService.getCampaignStatus(credentials, String(tonicCampaignId));
                // getCampaignStatus returns: { "0": { "link": "domain.com", "ssl": true }, "status": "active" }
                const linkData = campaignStatus['0'] || campaignStatus;
                if (linkData.link) {
                  const protocol = linkData.ssl ? 'https://' : 'http://';
                  trackingLink = linkData.link.startsWith('http') ? linkData.link : `${protocol}${linkData.link}`;
                }
                directLink = linkData.direct_link || campaignStatus.direct_link || null;
                logger.info('tonic', `🔗 [CRON] Got links from status endpoint - tracking: ${trackingLink}, direct: ${directLink}`);
              } catch (statusError) {
                logger.warn('tonic', `Could not fetch campaign status: ${statusError}`);
              }
            }

            // 3. Check if campaign needs DesignFlow or should launch directly
            if (campaign.needsDesignFlow) {
              // DESIGNFLOW PATH: Create task and wait for design
              logger.info('system', `🎨 [CRON] Campaign "${campaign.name}" needs DesignFlow, creating task...`);

              // Prepare reference links for DesignFlow
              const referenceLinks: string[] = [];
              if (trackingLink) {
                const fullTrackingLink = trackingLink.startsWith('http')
                  ? trackingLink
                  : `https://${trackingLink}`;
                referenceLinks.push(fullTrackingLink);
              }
              if (directLink) {
                referenceLinks.push(directLink);
              }

              // Create DesignFlow task
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

              // Save DesignFlowTask record in database
              await prisma.designFlowTask.create({
                data: {
                  campaignId: campaign.id,
                  designflowTaskId: designFlowTask.id,
                  status: designFlowTask.status,
                  title: designFlowTask.title,
                  requester: campaign.designFlowRequester || 'Harry',
                },
              });

              // Update campaign with Tonic data and set status to AWAITING_DESIGN
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

              logger.success('system', `🚀 [CRON] Campaign "${campaign.name}" → DesignFlow path: Article approved → Tonic campaign → DesignFlow task → AWAITING_DESIGN`);

              results.push({
                campaignId: campaign.id,
                campaignName: campaign.name,
                status: 'approved',
                action: `Article approved, Tonic campaign created (${tonicCampaignId}), DesignFlow task created (${designFlowTask.id}), status: AWAITING_DESIGN`,
              });

            } else {
              // DIRECT LAUNCH PATH: Skip DesignFlow, wait for tracking link first
              // Tracking link takes 10-14 minutes to become available from Tonic
              // poll-tracking-links cron will monitor and move to ARTICLE_APPROVED when ready
              logger.info('system', `🚀 [CRON] Campaign "${campaign.name}" does NOT need DesignFlow, waiting for tracking link...`);

              // Update campaign with Tonic data and set status to AWAITING_TRACKING
              // The poll-tracking-links cron will check for tracking link availability
              // and move to ARTICLE_APPROVED when the tracking link is ready
              await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                  status: CampaignStatus.AWAITING_TRACKING,
                  tonicCampaignId: String(tonicCampaignId),
                  tonicArticleId: articleStatus.headline_id,
                  tonicTrackingLink: trackingLink, // May be null initially, poll-tracking-links will update
                  tonicDirectLink: directLink,
                  trackingLinkPollingStartedAt: new Date(), // Start polling timer
                  trackingLinkPollingAttempts: 0,
                },
              });

              logger.success('system', `✅ [CRON] Campaign "${campaign.name}" → Direct launch path: Article approved → Tonic campaign → AWAITING_TRACKING (poll-tracking-links will monitor)`);

              // AUDIT LOG: Article approved, now awaiting tracking link
              await campaignAudit.logStatusChange(
                campaign.id,
                'cron/check-articles',
                'PENDING_ARTICLE',
                'AWAITING_TRACKING',
                `Article approved by Tonic (headline_id: ${articleStatus.headline_id}), Tonic campaign created (${tonicCampaignId}), now waiting for tracking link`,
                { tonicCampaignId, headlineId: articleStatus.headline_id, trackingLink, directLink }
              );

              results.push({
                campaignId: campaign.id,
                campaignName: campaign.name,
                status: 'approved',
                action: `Article approved, Tonic campaign created (${tonicCampaignId}), status: AWAITING_TRACKING (polling for tracking link)`,
              });
            }

          } catch (processingError: unknown) {
            // If processing fails after approval, handle based on needsDesignFlow
            const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown error';
            logger.error('system', `❌ [CRON] Error processing approved article for "${campaign.name}": ${errorMessage}`);

            // IMPORTANT: If campaign needs DesignFlow and we failed to create the task,
            // mark as FAILED - we cannot allow process-campaigns to launch it
            if (campaign.needsDesignFlow) {
              // DesignFlow required but failed to create task → FAILED (cannot launch without design)
              await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                  status: CampaignStatus.FAILED,
                  tonicArticleId: articleStatus.headline_id,
                  // CRITICAL FIX: Save tonicCampaignId if it was created before the error
                  // This prevents duplicate campaign creation on retry
                  tonicCampaignId: tonicCampaignId ? String(tonicCampaignId) : undefined,
                  errorDetails: {
                    step: 'designflow-creation',
                    message: `Failed to create DesignFlow task: ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    requiresDesignFlow: true,
                  },
                },
              });

              logger.error('system', `❌ [CRON] Campaign "${campaign.name}" FAILED: Could not create DesignFlow task`);

              results.push({
                campaignId: campaign.id,
                campaignName: campaign.name,
                status: 'failed',
                action: `DesignFlow task creation failed: ${errorMessage}. Status: FAILED (requires manual intervention).`,
              });
            } else {
              // No DesignFlow required but error occurred → FAILED
              // CRITICAL: Do NOT set to ARTICLE_APPROVED because:
              // 1. The campaign never passed through AWAITING_TRACKING
              // 2. trackingLinkPollingStartedAt is not set
              // 3. process-campaigns will reject it anyway (requires trackingLinkPollingStartedAt)
              // Mark as FAILED so the user knows to investigate
              await prisma.campaign.update({
                where: { id: campaign.id },
                data: {
                  status: CampaignStatus.FAILED,
                  tonicArticleId: articleStatus.headline_id,
                  // Save tonicCampaignId if it was created before the error
                  tonicCampaignId: tonicCampaignId ? String(tonicCampaignId) : undefined,
                  errorDetails: {
                    step: 'awaiting-tracking-transition',
                    message: `Failed to transition to AWAITING_TRACKING: ${errorMessage}. This may indicate a Prisma client issue - redeploy may be required.`,
                    timestamp: new Date().toISOString(),
                    requiresRedeploy: true,
                  },
                },
              });

              // AUDIT LOG: Failed to transition to AWAITING_TRACKING
              await campaignAudit.logStatusChange(
                campaign.id,
                'cron/check-articles',
                'PENDING_ARTICLE',
                'FAILED',
                `Article approved but failed to enter AWAITING_TRACKING: ${errorMessage}`,
                { tonicCampaignId, errorMessage }
              );

              logger.error('system', `❌ [CRON] Campaign "${campaign.name}" FAILED: Could not transition to AWAITING_TRACKING - possible Prisma client issue`);

              results.push({
                campaignId: campaign.id,
                campaignName: campaign.name,
                status: 'failed',
                action: `Article approved but AWAITING_TRACKING transition failed: ${errorMessage}. Status: FAILED (may require redeploy).`,
              });
            }
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

          // AUDIT LOG: Article rejected
          await campaignAudit.logStatusChange(
            campaign.id,
            'cron/check-articles',
            'PENDING_ARTICLE',
            'FAILED',
            `Article rejected by Tonic: ${articleStatus.rejection_reason || 'No reason provided'}`,
            { rejectionReason: articleStatus.rejection_reason }
          );

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
