import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * GET /api/campaigns/[id]
 * Get a single campaign by ID
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: {
        id: params.id,
      },
      include: {
        offer: true,
        platforms: true,
        aiContent: true,
        media: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        {
          success: false,
          error: 'Campaign not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: campaign,
    });
  } catch (error: any) {
    console.error('Error fetching campaign:', error);
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
 * PATCH /api/campaigns/[id]
 * Update a campaign
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();

    const campaign = await prisma.campaign.update({
      where: {
        id: params.id,
      },
      data: {
        ...body,
      },
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
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/campaigns/[id]
 * Delete a campaign
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await prisma.campaign.delete({
      where: {
        id: params.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting campaign:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
