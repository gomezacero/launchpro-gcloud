/**
 * ============================================================================
 * Cloud Tasks Handler: Check Article Approval
 * ============================================================================
 *
 * Este endpoint es llamado por Cloud Tasks para verificar si un artículo
 * de campaña ha sido aprobado en Tonic.
 *
 * @route POST /api/tasks/check-article
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import { tonicService } from '@/services/tonic.service';
import {
  isCloudTasksRequest,
  getTaskRetryInfo,
  enqueueArticleCheck,
  enqueueTrackingPoll,
  type TaskPayload,
} from '@/lib/cloud-tasks';
import { CampaignStatus } from '@prisma/client';

const MAX_ARTICLE_CHECK_ATTEMPTS = 30;
const RETRY_DELAY_SECONDS = 60;

export async function POST(request: Request) {
  if (!isCloudTasksRequest(request)) {
    logger.warn('cloud-tasks', 'Unauthorized request to check-article endpoint');
    return NextResponse.json(
      { error: 'Unauthorized - This endpoint only accepts Cloud Tasks requests' },
      { status: 401 }
    );
  }

  const retryInfo = getTaskRetryInfo(request);

  try {
    const payload: TaskPayload = await request.json();
    const { campaignId } = payload;

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });
    }

    logger.info('cloud-tasks', `[check-article] Processing campaign`, {
      campaignId,
      attempt: retryInfo.retryCount + 1,
    });

    // Get campaign with platforms and their Tonic accounts
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    if (campaign.status !== CampaignStatus.PENDING_ARTICLE) {
      return NextResponse.json({
        success: true,
        message: `Campaign is in ${campaign.status} state, skipping`,
      });
    }

    // Get article request ID
    const requestId = campaign.tonicArticleRequestId
      ? parseInt(campaign.tonicArticleRequestId)
      : null;

    if (!requestId) {
      campaignLogger.failStep(campaignId, 'tonic_approval', 'No article request ID');
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
      return NextResponse.json({ success: false, error: 'No article request ID' });
    }

    // Get Tonic credentials from the TONIC platform
    const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
    const tonicAccount = tonicPlatform?.tonicAccount;

    if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
      campaignLogger.failStep(campaignId, 'tonic_approval', 'Missing Tonic credentials');
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
      return NextResponse.json({ success: false, error: 'Missing Tonic credentials' });
    }

    const credentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    // Check article status via Tonic API
    const articleStatus = await tonicService.getArticleRequest(credentials, requestId);

    if (!articleStatus) {
      if (retryInfo.retryCount < MAX_ARTICLE_CHECK_ATTEMPTS) {
        await enqueueArticleCheck(campaignId, RETRY_DELAY_SECONDS);
        return NextResponse.json({ success: true, message: 'Re-enqueued' });
      }
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
      return NextResponse.json({ success: false, error: 'Max attempts reached' });
    }

    const status = articleStatus.request_status || 'pending';

    if (status === 'approved') {
      logger.success('cloud-tasks', `[check-article] Article approved`, { campaignId });
      campaignLogger.completeStep(campaignId, 'tonic_approval', 'Article approved');

      // Extract tracking link and direct link from article status
      const tonicCampaignId = articleStatus.campaign_id
        ? String(articleStatus.campaign_id)
        : campaign.tonicCampaignId;
      const trackingLink = articleStatus.tracking_link || null;
      const directLink = articleStatus.direct_link || null;

      // Update campaign with links if available
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.AWAITING_TRACKING,
          tonicCampaignId: tonicCampaignId || campaign.tonicCampaignId,
          tonicTrackingLink: trackingLink,
          tonicDirectLink: directLink,
        },
      });

      // If we already have a VALID tracking link, proceed to process-campaign
      // Validate: must be a real URL, not empty, not a placeholder
      const isValidTrackingLink = trackingLink &&
        trackingLink.length > 10 &&
        (trackingLink.startsWith('http://') || trackingLink.startsWith('https://')) &&
        !trackingLink.includes('pending') &&
        !trackingLink.includes('generating') &&
        !trackingLink.includes('placeholder');

      if (isValidTrackingLink) {
        logger.info('cloud-tasks', `[check-article] Valid tracking link found, skipping AWAITING_TRACKING`, {
          campaignId,
          trackingLink,
        });

        // Skip poll-tracking, go directly to GENERATING_AI
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.GENERATING_AI },
        });

        const { enqueueCampaignProcessing } = await import('@/lib/cloud-tasks');
        await enqueueCampaignProcessing(campaignId);

        return NextResponse.json({
          success: true,
          status: 'ARTICLE_APPROVED_WITH_LINK',
          nextStep: 'process-campaign',
        });
      } else if (trackingLink) {
        // Invalid tracking link received, log and continue to poll-tracking
        logger.warn('cloud-tasks', `[check-article] Invalid tracking link received, will poll for valid link`, {
          campaignId,
          receivedLink: trackingLink,
        });
      }

      // Otherwise, poll for tracking link
      await enqueueTrackingPoll(campaignId, 30);

      return NextResponse.json({
        success: true,
        status: 'ARTICLE_APPROVED',
        nextStep: 'poll-tracking',
      });

    } else if (status === 'rejected') {
      logger.warn('cloud-tasks', `[check-article] Article rejected`, { campaignId });
      campaignLogger.failStep(campaignId, 'tonic_approval', 'Article rejected');

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });

      return NextResponse.json({ success: false, status: 'ARTICLE_REJECTED' });

    } else {
      // Still pending
      const attemptCount = retryInfo.retryCount + 1;

      if (attemptCount >= MAX_ARTICLE_CHECK_ATTEMPTS) {
        campaignLogger.failStep(campaignId, 'tonic_approval', 'Timeout waiting for article approval');
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.FAILED },
        });
        return NextResponse.json({ success: false, status: 'TIMEOUT' });
      }

      await enqueueArticleCheck(campaignId, RETRY_DELAY_SECONDS);
      return NextResponse.json({
        success: true,
        status: 'PENDING',
        attempt: attemptCount,
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('cloud-tasks', `[check-article] Error`, { error: errorMessage });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
