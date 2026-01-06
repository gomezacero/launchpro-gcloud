import { NextRequest, NextResponse } from 'next/server';
import { metaService } from '@/services/meta.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/pages/[pageId]/instagram
 * Get the Instagram business account linked to a specific Facebook Page
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params;

    if (!pageId) {
      return NextResponse.json(
        { success: false, error: 'Page ID is required' },
        { status: 400 }
      );
    }

    // Get access token from global settings or environment
    let accessToken: string | null = null;

    const globalSettings = await prisma.globalSettings.findUnique({
      where: { id: 'global-settings' },
    });

    accessToken = globalSettings?.metaAccessToken ?? process.env.META_ACCESS_TOKEN ?? null;

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Meta access token available' },
        { status: 400 }
      );
    }

    console.log(`[API] Fetching Instagram account for Page ID: ${pageId}`);

    // Use the existing getInstagramAccount method which queries /{page-id}?fields=instagram_business_account
    const pageData = await metaService.getInstagramAccount(pageId);

    const instagramAccount = pageData?.instagram_business_account;

    if (!instagramAccount) {
      console.log(`[API] No Instagram business account linked to Page ${pageId}`);
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No Instagram account linked to this Facebook Page',
      });
    }

    console.log(`[API] Found Instagram account: @${instagramAccount.username} (${instagramAccount.id})`);

    return NextResponse.json({
      success: true,
      data: {
        id: instagramAccount.id,
        username: instagramAccount.username,
        profile_picture_url: instagramAccount.profile_picture_url,
      },
    });
  } catch (error: any) {
    console.error('[API] Error fetching Instagram for Page:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Instagram account',
      },
      { status: 500 }
    );
  }
}
