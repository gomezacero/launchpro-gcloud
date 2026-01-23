import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { CampaignStatus, Prisma } from '@prisma/client';

/**
 * POST /api/diagnostic/fix-campaign-status
 *
 * Fixes campaigns where platforms are ACTIVE but campaign status is FAILED.
 * This can happen due to race conditions in cron processing.
 *
 * Body: { campaignId?: string } - If provided, fix only that campaign. Otherwise fix all affected.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { campaignId } = body;

    // Find campaigns where:
    // - Campaign status is FAILED
    // - But at least one platform is ACTIVE (meaning launch succeeded)
    const whereClause: any = {
      status: CampaignStatus.FAILED,
      platforms: {
        some: {
          status: 'ACTIVE',
        },
      },
    };

    if (campaignId) {
      whereClause.id = campaignId;
    }

    const campaignsToFix = await prisma.campaign.findMany({
      where: whereClause,
      include: {
        platforms: true,
      },
    });

    if (campaignsToFix.length === 0) {
      return NextResponse.json({
        success: true,
        message: campaignId
          ? 'Campaign not found or does not need fixing'
          : 'No campaigns need fixing',
        fixed: 0,
      });
    }

    const results: Array<{
      id: string;
      name: string;
      previousStatus: string;
      newStatus: string;
      activePlatforms: string[];
    }> = [];

    for (const campaign of campaignsToFix) {
      const activePlatforms = campaign.platforms
        .filter((p) => p.status === 'ACTIVE')
        .map((p) => p.platform);

      // Update campaign to ACTIVE and clear errorDetails
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.ACTIVE,
          errorDetails: Prisma.DbNull,
        },
      });

      results.push({
        id: campaign.id,
        name: campaign.name,
        previousStatus: 'FAILED',
        newStatus: 'ACTIVE',
        activePlatforms,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Fixed ${results.length} campaign(s)`,
      fixed: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/diagnostic/fix-campaign-status
 *
 * List campaigns that need fixing (platforms ACTIVE but campaign FAILED)
 */
export async function GET(request: NextRequest) {
  try {
    const campaignsToFix = await prisma.campaign.findMany({
      where: {
        status: CampaignStatus.FAILED,
        platforms: {
          some: {
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        errorDetails: true,
        launchedAt: true,
        platforms: {
          select: {
            platform: true,
            status: true,
            metaCampaignId: true,
            tiktokCampaignId: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: campaignsToFix.length,
      campaigns: campaignsToFix,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
