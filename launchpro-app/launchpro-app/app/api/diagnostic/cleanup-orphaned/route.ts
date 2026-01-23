import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CampaignStatus } from '@prisma/client';

/**
 * GET /api/diagnostic/cleanup-orphaned
 *
 * Cleans up orphaned campaigns stuck in GENERATING_AI status
 * that are missing Tonic credentials and blocking the cron queue.
 */
export async function GET(request: NextRequest) {
  try {
    // Find campaigns stuck in GENERATING_AI for more than 10 minutes
    const stuckThreshold = new Date(Date.now() - 10 * 60 * 1000);

    const stuckCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.GENERATING_AI,
        updatedAt: { lt: stuckThreshold },
      },
      include: {
        platforms: {
          where: { platform: 'TONIC' },
          include: { tonicAccount: true },
        },
      },
    });

    const results: Array<{
      id: string;
      name: string;
      action: string;
      reason: string;
    }> = [];

    for (const campaign of stuckCampaigns) {
      const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
      const hasTonic = tonicPlatform?.tonicAccount?.tonicConsumerKey;

      // Get retry count from errorDetails
      const errorDetails = campaign.errorDetails as any;
      const retryCount = errorDetails?.retryCount || 0;

      // Mark as failed if:
      // 1. Missing Tonic credentials, OR
      // 2. Has exceeded 2 retries already
      if (!hasTonic || retryCount >= 2) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.FAILED,
            errorDetails: {
              ...errorDetails,
              step: 'cleanup',
              message: !hasTonic
                ? 'Marked as failed: missing Tonic credentials (orphaned campaign)'
                : `Marked as failed: exceeded retry limit (${retryCount} attempts)`,
              timestamp: new Date().toISOString(),
              cleanedUp: true,
            },
          },
        });

        results.push({
          id: campaign.id,
          name: campaign.name,
          action: 'MARKED_FAILED',
          reason: !hasTonic ? 'Missing Tonic credentials' : `Exceeded ${retryCount} retries`,
        });
      } else {
        results.push({
          id: campaign.id,
          name: campaign.name,
          action: 'SKIPPED',
          reason: 'Has valid Tonic credentials and retries remaining',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${stuckCampaigns.length} stuck campaigns`,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
