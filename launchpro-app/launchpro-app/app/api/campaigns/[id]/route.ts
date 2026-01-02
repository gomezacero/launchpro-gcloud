import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessCampaign } from '@/lib/auth-utils';

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
