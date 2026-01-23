import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/campaigns/[id]/logs
 *
 * Returns the launch logs for a specific campaign.
 * These logs show the step-by-step process of campaign creation/launch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        status: true,
        launchLogs: true,
        errorDetails: true,
        launchedAt: true,
        createdAt: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        launchLogs: campaign.launchLogs || [],
        errorDetails: campaign.errorDetails,
        launchedAt: campaign.launchedAt,
        createdAt: campaign.createdAt,
      },
    });
  } catch (error: any) {
    console.error(`[API] Error fetching campaign logs:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
