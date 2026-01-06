import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaService } from '@/services/meta.service';

/**
 * GET /api/accounts/[id]/instagram-accounts
 * Get available Instagram accounts for a Meta ad account
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

    // Only works for Meta accounts
    if (account.accountType !== 'META') {
      return NextResponse.json(
        {
          success: false,
          error: 'Instagram accounts only available for Meta accounts',
        },
        { status: 400 }
      );
    }

    // Need an Ad Account ID to fetch Instagram accounts
    if (!account.metaAdAccountId) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Meta Ad Account ID configured for this account',
        },
        { status: 400 }
      );
    }

    // Get access token - try account first, then global settings, then env
    let accessToken = account.metaAccessToken;

    if (!accessToken) {
      console.log(`[API] No access token in account "${account.name}". Trying global settings...`);

      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });

      accessToken = globalSettings?.metaAccessToken ?? null;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = process.env.META_ACCESS_TOKEN ?? null;
        if (accessToken) {
          console.log(`[API] Using META_ACCESS_TOKEN from environment`);
        }
      } else {
        console.log(`[API] Using access token from global settings`);
      }
    }

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Meta access token available. Please configure in account, global settings, or environment.',
        },
        { status: 400 }
      );
    }

    // Fetch Instagram accounts from Meta API
    console.log(`[API] Fetching Instagram accounts for ad account ${account.metaAdAccountId}`);

    const instagramAccounts = await metaService.getInstagramAccounts(
      account.metaAdAccountId,
      accessToken
    );

    console.log(`[API] Found ${instagramAccounts.length} Instagram account(s) for ad account ${account.metaAdAccountId}`);

    return NextResponse.json({
      success: true,
      data: instagramAccounts.map(acc => ({
        id: acc.id,
        username: acc.username,
        profile_picture_url: acc.profile_picture_url,
      })),
    });
  } catch (error: any) {
    console.error('[API] Error fetching Instagram accounts:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Instagram accounts',
      },
      { status: 500 }
    );
  }
}
