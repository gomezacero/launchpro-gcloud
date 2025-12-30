import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * DEBUG endpoint to check campaign platform data
 * GET /api/debug/campaign/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        platforms: {
          select: {
            id: true,
            platform: true,
            adsPerAdSet: true,
            aiMediaCount: true,
            aiMediaType: true,
            budget: true,
            generateWithAI: true,
          },
        },
        media: {
          select: {
            id: true,
            type: true,
            fileName: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    return NextResponse.json({
      campaignId: campaign.id,
      name: campaign.name,
      campaignType: campaign.campaignType,
      status: campaign.status,
      platforms: campaign.platforms,
      mediaCount: campaign.media.length,
      media: campaign.media,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
