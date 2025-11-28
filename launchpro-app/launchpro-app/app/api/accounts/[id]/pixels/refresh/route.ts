import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tiktokService } from '@/services/tiktok.service';

/**
 * POST /api/accounts/[id]/pixels/refresh
 * Auto-fetch and update pixel ID for a TikTok account
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch the account
    const account = await prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    // Only works for TikTok accounts
    if (account.accountType !== 'TIKTOK') {
      return NextResponse.json(
        {
          success: false,
          error: 'Pixel refresh only supported for TikTok accounts',
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!account.tiktokAdvertiserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account missing advertiser ID. Cannot fetch pixels.',
        },
        { status: 400 }
      );
    }

    if (!account.tiktokAccessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account missing access token. Cannot fetch pixels.',
        },
        { status: 400 }
      );
    }

    // Fetch pixels from TikTok API
    console.log(`[API] Fetching pixels for account ${account.name} (${account.tiktokAdvertiserId})`);

    const pixels = await tiktokService.listPixels(
      account.tiktokAdvertiserId,
      account.tiktokAccessToken
    );

    if (!pixels || pixels.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No pixels found for advertiser ${account.tiktokAdvertiserId}. Please create a pixel in TikTok Ads Manager.`,
        },
        { status: 404 }
      );
    }

    // Use the first pixel
    const firstPixel = pixels[0];
    console.log(`[API] Found ${pixels.length} pixel(s). Using: ${firstPixel.pixel_id}`);

    // Update account with pixel ID
    await prisma.account.update({
      where: { id },
      data: { tiktokPixelId: firstPixel.pixel_id },
    });

    console.log(`[API] Successfully updated account ${account.name} with pixel ID ${firstPixel.pixel_id}`);

    return NextResponse.json({
      success: true,
      pixelId: firstPixel.pixel_id,
      pixelName: firstPixel.pixel_name || 'Unnamed',
      totalPixelsFound: pixels.length,
    });
  } catch (error: any) {
    console.error('[API] Error refreshing pixel:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to refresh pixel',
      },
      { status: 500 }
    );
  }
}
