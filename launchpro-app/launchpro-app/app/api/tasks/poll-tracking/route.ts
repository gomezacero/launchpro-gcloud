/**
 * ============================================================================
 * Cloud Tasks Handler: Poll Tracking Link
 * ============================================================================
 *
 * Este endpoint es llamado por Cloud Tasks para verificar si el tracking link
 * de una campaña está disponible en Tonic.
 *
 * @route POST /api/tasks/poll-tracking
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import { tonicService } from '@/services/tonic.service';
import {
  isCloudTasksRequest,
  getTaskRetryInfo,
  enqueueTrackingPoll,
  enqueueCampaignProcessing,
  type TaskPayload,
} from '@/lib/cloud-tasks';
import { CampaignStatus } from '@prisma/client';

const MAX_TRACKING_CHECK_ATTEMPTS = 20;
const RETRY_DELAY_SECONDS = 30;

export async function POST(request: Request) {
  if (!isCloudTasksRequest(request)) {
    logger.warn('cloud-tasks', 'Unauthorized request to poll-tracking endpoint');
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

    logger.info('cloud-tasks', `[poll-tracking] Processing campaign`, {
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

    if (campaign.status !== CampaignStatus.AWAITING_TRACKING) {
      return NextResponse.json({
        success: true,
        message: `Campaign is in ${campaign.status} state, skipping`,
      });
    }

    if (!campaign.tonicCampaignId) {
      campaignLogger.failStep(campaignId, 'tracking_link', 'No Tonic campaign ID');
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
      return NextResponse.json({ success: false, error: 'No Tonic campaign ID' });
    }

    // Get Tonic credentials from the TONIC platform
    const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
    const tonicAccount = tonicPlatform?.tonicAccount;

    if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
      campaignLogger.failStep(campaignId, 'tracking_link', 'Missing Tonic credentials');
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

    // Get campaign status from Tonic to check for tracking link
    const statusResult = await tonicService.getCampaignStatus(credentials, campaign.tonicCampaignId);

    if (!statusResult) {
      if (retryInfo.retryCount < MAX_TRACKING_CHECK_ATTEMPTS) {
        await enqueueTrackingPoll(campaignId, RETRY_DELAY_SECONDS);
        return NextResponse.json({ success: true, message: 'Re-enqueued' });
      }
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });
      return NextResponse.json({ success: false, error: 'Max attempts reached' });
    }

    // Extract tracking link from response
    // getCampaignStatus returns: { "0": { "link": "domain.com", "ssl": true }, "status": "active" }
    const linkData = statusResult['0'] || statusResult;
    const trackingLink = linkData.link
      ? `https://${linkData.link}`
      : linkData.tracking_link || linkData.trackingUrl;

    // Validate tracking link: must be a real URL, not empty, not a placeholder
    const isValidTrackingLink = trackingLink &&
      trackingLink.length > 10 &&
      (trackingLink.startsWith('http://') || trackingLink.startsWith('https://')) &&
      !trackingLink.includes('pending') &&
      !trackingLink.includes('generating') &&
      !trackingLink.includes('placeholder');

    if (isValidTrackingLink) {
      logger.success('cloud-tasks', `[poll-tracking] Valid tracking link obtained`, {
        campaignId,
        trackingLink,
      });
      campaignLogger.completeStep(campaignId, 'tracking_link', 'Tracking link obtained');

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          tonicTrackingLink: trackingLink,
          status: CampaignStatus.GENERATING_AI,
        },
      });

      await enqueueCampaignProcessing(campaignId);

      return NextResponse.json({
        success: true,
        status: 'TRACKING_LINK_OBTAINED',
        nextStep: 'process-campaign',
      });

    } else if (trackingLink) {
      // Received something but it's not valid, log and continue polling
      logger.warn('cloud-tasks', `[poll-tracking] Invalid tracking link received, continuing to poll`, {
        campaignId,
        receivedLink: trackingLink,
      });
    }

    // No valid tracking link yet, continue polling
    {
      const attemptCount = retryInfo.retryCount + 1;

      if (attemptCount >= MAX_TRACKING_CHECK_ATTEMPTS) {
        campaignLogger.failStep(campaignId, 'tracking_link', 'Timeout waiting for tracking link');
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.FAILED },
        });
        return NextResponse.json({ success: false, status: 'TIMEOUT' });
      }

      await enqueueTrackingPoll(campaignId, RETRY_DELAY_SECONDS);
      return NextResponse.json({
        success: true,
        status: 'PENDING',
        attempt: attemptCount,
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('cloud-tasks', `[poll-tracking] Error`, { error: errorMessage });
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
