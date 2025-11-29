import { NextRequest, NextResponse } from 'next/server';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { emailService } from '@/services/email.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { CampaignStatus } from '@prisma/client';

/**
 * Launch an existing campaign to configured platforms
 * POST /api/campaigns/[id]/launch
 *
 * This endpoint processes the launch SYNCHRONOUSLY but the browser
 * can fire multiple requests in parallel, allowing simultaneous campaign launches.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const startTime = Date.now();

  try {
    logger.info('api', `POST /api/campaigns/${campaignId}/launch - Starting launch`);

    // 1. Validate campaign exists and is ready to launch
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { platforms: true, offer: true }
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check if already launching or active
    if (campaign.status === CampaignStatus.LAUNCHING) {
      return NextResponse.json(
        { success: false, error: 'Campaign is already being launched' },
        { status: 400 }
      );
    }

    if (campaign.status === CampaignStatus.ACTIVE) {
      return NextResponse.json(
        { success: false, error: 'Campaign is already active' },
        { status: 400 }
      );
    }

    // 2. Mark campaign as LAUNCHING
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.LAUNCHING }
    });

    // 3. Execute the actual campaign launch (SYNCHRONOUS - waits for completion)
    let result;
    try {
      result = await campaignOrchestrator.launchExistingCampaignToPlatforms(campaignId);
    } catch (launchError: any) {
      // Update campaign status to FAILED
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'platform-launch',
            message: launchError.message,
            timestamp: new Date().toISOString(),
            technicalDetails: launchError.stack || launchError.message
          }
        }
      });

      // Try to send failure email
      try {
        const failedCampaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          include: { platforms: true, offer: true }
        });
        await emailService.sendCampaignFailed(failedCampaign, launchError.message);
      } catch (emailErr) {
        logger.error('email', `Failed to send failure email: ${emailErr}`);
      }

      throw launchError;
    }

    const duration = Date.now() - startTime;
    logger.success('api', `Campaign ${campaignId} launch completed in ${duration}ms`, {
      platforms: result.platforms.map(p => ({ platform: p.platform, success: p.success })),
      duration
    });

    // 4. Get updated campaign for response and email
    const updatedCampaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { platforms: true, offer: true }
    });

    // 5. Send email notification based on result
    const allSuccess = result.platforms.every(p => p.success);
    try {
      if (allSuccess) {
        await emailService.sendCampaignSuccess(updatedCampaign);
      } else {
        const failedPlatforms = result.platforms.filter(p => !p.success);
        const errorMsg = failedPlatforms.map(p => `${p.platform}: ${p.error || 'Unknown error'}`).join('; ');
        await emailService.sendCampaignFailed(updatedCampaign, errorMsg);
      }
    } catch (emailErr) {
      logger.error('email', `Failed to send email notification: ${emailErr}`);
    }

    // 6. Return result
    return NextResponse.json({
      success: true,
      message: allSuccess ? 'Campaign launched successfully!' : 'Campaign launched with some errors',
      campaignId: campaignId,
      status: updatedCampaign?.status,
      platforms: result.platforms,
      duration
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error launching campaign ${campaignId}: ${error.message}`, {
      campaignId,
      error: error.message,
      stack: error.stack,
      duration
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
