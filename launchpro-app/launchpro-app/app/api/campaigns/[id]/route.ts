import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessCampaign } from '@/lib/auth-utils';
import { CampaignStatus } from '@prisma/client';

/**
 * GET /api/campaigns/[id]
 * Get a single campaign by ID - with ownership check
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        offer: true,
        platforms: true,
        media: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        designFlowTask: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (!canAccessCampaign(user!, campaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - You can only access your own campaigns' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: campaign,
    });
  } catch (error: any) {
    console.error('Error fetching campaign:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/campaigns/[id]
 * Update a campaign - with ownership check
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // First check ownership
    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: { createdById: true },
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (!canAccessCampaign(user!, existingCampaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - You can only update your own campaigns' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { ...body },
      include: {
        offer: true,
        platforms: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: campaign,
    });
  } catch (error: any) {
    console.error('Error updating campaign:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign - with ownership check
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // First check ownership
    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
      select: { createdById: true },
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (!canAccessCampaign(user!, existingCampaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - You can only delete your own campaigns' },
        { status: 403 }
      );
    }

    await prisma.campaign.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/campaigns/[id]
 * Update campaign for edit mode (post-design) - restricted fields
 * Only allows updating: budget, startDate, and triggers launch
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // First check ownership and get current state
    const existingCampaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        platforms: true,
        designFlowTask: true,
      },
    });

    if (!existingCampaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    if (!canAccessCampaign(user!, existingCampaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - You can only update your own campaigns' },
        { status: 403 }
      );
    }

    // Validate campaign is in an editable state
    const editableStates: CampaignStatus[] = [
      CampaignStatus.DRAFT,
      CampaignStatus.AWAITING_DESIGN,
      CampaignStatus.FAILED,
    ];

    if (!editableStates.includes(existingCampaign.status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Campaign cannot be edited in ${existingCampaign.status} state`,
        },
        { status: 400 }
      );
    }

    // Extract allowed fields from body
    const { platforms: platformUpdates, launchAfterSave } = body;

    // Update platform budgets and start dates
    if (platformUpdates && Array.isArray(platformUpdates)) {
      for (const platformUpdate of platformUpdates) {
        const existingPlatform = existingCampaign.platforms.find(
          (p) => p.platform === platformUpdate.platform
        );

        if (existingPlatform) {
          await prisma.campaignPlatform.update({
            where: { id: existingPlatform.id },
            data: {
              budget: platformUpdate.budget ?? existingPlatform.budget,
              startDate: platformUpdate.startDate
                ? new Date(platformUpdate.startDate)
                : existingPlatform.startDate,
            },
          });
        }
      }
    }

    // Determine new status
    let newStatus = existingCampaign.status;
    if (existingCampaign.status === CampaignStatus.AWAITING_DESIGN) {
      // If design is complete, move to READY_TO_LAUNCH
      if (existingCampaign.designFlowTask?.status === 'Done') {
        newStatus = CampaignStatus.READY_TO_LAUNCH;
      }
    }

    // Update campaign status
    const updatedCampaign = await prisma.campaign.update({
      where: { id },
      data: {
        status: newStatus,
      },
      include: {
        offer: true,
        platforms: true,
        media: true,
        designFlowTask: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedCampaign,
      launchAfterSave: launchAfterSave || false,
    });
  } catch (error: any) {
    console.error('Error updating campaign (PUT):', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
