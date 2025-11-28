import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tiktokService } from '@/services/tiktok.service';

/**
 * GET /api/accounts/[id]/identities
 * Get available TikTok Identities for a TikTok account
 */
export async function GET(
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
          error: 'Identities only available for TikTok accounts',
        },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!account.tiktokAdvertiserId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Account missing advertiser ID. Cannot fetch identities.',
        },
        { status: 400 }
      );
    }

    // Get access token - try account first, then global settings, then env
    let accessToken = account.tiktokAccessToken;

    if (!accessToken) {
      console.log(`[API] No access token in account "${account.name}". Trying global settings...`);

      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });

      accessToken = globalSettings?.tiktokAccessToken ?? null;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = process.env.TIKTOK_ACCESS_TOKEN ?? null;
        if (accessToken) {
          console.log(`[API] Using TIKTOK_ACCESS_TOKEN from environment`);
        }
      } else {
        console.log(`[API] Using access token from global settings`);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No TikTok access token available. Please configure in account, global settings, or environment.',
        },
        { status: 400 }
      );
    }

    // Fetch identities from TikTok API
    console.log(`[API] Fetching Identities for account ${account.name} (${account.tiktokAdvertiserId})`);

    const identitiesResponse = await tiktokService.getIdentities(
      account.tiktokAdvertiserId,
      accessToken
    );

    const identities = identitiesResponse?.identity_list || [];

    if (identities.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No TikTok Identities found for this account. Please link a TikTok account in TikTok Ads Manager.',
        },
        { status: 404 }
      );
    }

    console.log(`[API] Found ${identities.length} Identity(s) for account ${account.name}`);

    return NextResponse.json({
      success: true,
      data: identities.map((i: any) => ({
        id: i.identity_id,
        name: i.display_name || 'Unnamed',
        type: i.identity_type,
      })),
    });
  } catch (error: any) {
    console.error('[API] Error fetching TikTok Identities:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch TikTok Identities',
      },
      { status: 500 }
    );
  }
}
