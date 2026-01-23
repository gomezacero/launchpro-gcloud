import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CampaignStatus } from '@prisma/client';

/**
 * GET /api/diagnostic/cleanup-orphaned
 *
 * Cleans up ALL campaigns stuck in GENERATING_AI status.
 * Since the new cron doesn't retry GENERATING_AI, these are orphaned.
 */
export async function GET(request: NextRequest) {
  try {
    // Find ALL campaigns stuck in GENERATING_AI (no time threshold needed)
    const stuckCampaigns = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.GENERATING_AI,
      },
      select: {
        id: true,
        name: true,
        errorDetails: true,
      },
    });

    if (stuckCampaigns.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No stuck campaigns found',
        results: [],
        timestamp: new Date().toISOString(),
      });
    }

    const results: Array<{
      id: string;
      name: string;
      action: string;
    }> = [];

    // Mark all as FAILED
    for (const campaign of stuckCampaigns) {
      const errorDetails = campaign.errorDetails as any;

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            ...errorDetails,
            step: 'cleanup',
            message: 'Marked as failed: campaign was stuck in GENERATING_AI (orphaned)',
            timestamp: new Date().toISOString(),
            cleanedUp: true,
          },
        },
      });

      results.push({
        id: campaign.id,
        name: campaign.name,
        action: 'MARKED_FAILED',
      });
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${stuckCampaigns.length} stuck campaigns`,
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
