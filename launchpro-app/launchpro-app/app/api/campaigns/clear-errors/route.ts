import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-utils';
import { CampaignStatus, Prisma } from '@prisma/client';

/**
 * POST /api/campaigns/clear-errors
 * Clears errorDetails from all FAILED campaigns for the authenticated user
 * Optionally resets them to a specified status (default: DRAFT)
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const { campaignId, resetStatus = 'DRAFT' } = body;

    // Validate resetStatus
    const validStatuses: CampaignStatus[] = [
      CampaignStatus.DRAFT,
      CampaignStatus.ARTICLE_APPROVED,
      CampaignStatus.READY_TO_LAUNCH,
    ];

    if (!validStatuses.includes(resetStatus as CampaignStatus)) {
      return NextResponse.json(
        { success: false, error: `Invalid resetStatus. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Build where clause
    const whereClause: any = {
      createdById: user!.id,
    };

    // If specific campaignId provided, only clear that one
    if (campaignId) {
      whereClause.id = campaignId;
    } else {
      // Otherwise, clear all FAILED campaigns
      whereClause.status = CampaignStatus.FAILED;
    }

    // Get campaigns to be cleared
    const campaignsToUpdate = await prisma.campaign.findMany({
      where: whereClause,
      select: { id: true, name: true, status: true },
    });

    if (campaignsToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No campaigns found to clear',
        cleared: 0,
      });
    }

    // Clear errorDetails and optionally reset status
    const result = await prisma.campaign.updateMany({
      where: whereClause,
      data: {
        errorDetails: Prisma.DbNull,
        status: resetStatus as CampaignStatus,
      },
    });

    console.log(`[CLEAR-ERRORS] Cleared errorDetails from ${result.count} campaigns for user ${user!.email}`);

    return NextResponse.json({
      success: true,
      message: `Cleared errorDetails from ${result.count} campaign(s)`,
      cleared: result.count,
      campaigns: campaignsToUpdate.map(c => ({ id: c.id, name: c.name, previousStatus: c.status })),
      newStatus: resetStatus,
    });

  } catch (error: any) {
    console.error('[CLEAR-ERRORS] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/campaigns/clear-errors
 * Lists all campaigns with errorDetails for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const campaignsWithErrors = await prisma.campaign.findMany({
      where: {
        createdById: user!.id,
        errorDetails: { not: null },
      },
      select: {
        id: true,
        name: true,
        status: true,
        errorDetails: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      count: campaignsWithErrors.length,
      campaigns: campaignsWithErrors,
    });

  } catch (error: any) {
    console.error('[CLEAR-ERRORS] Error listing:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
