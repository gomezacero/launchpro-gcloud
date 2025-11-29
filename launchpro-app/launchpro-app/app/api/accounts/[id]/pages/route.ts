import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaService } from '@/services/meta.service';

/**
 * GET /api/accounts/[id]/pages
 * Get available Facebook Fan Pages for a Meta account
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
          error: 'Fan Pages only available for Meta accounts',
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

    // Fetch pages from Meta API
    // If we have an Ad Account ID, get pages that can be promoted with that account
    // This ensures we only show pages the ad account has permission to use
    console.log(`[API] Fetching Fan Pages for account ${account.name}`);

    let pages: { id: string; name: string }[] = [];

    if (account.metaAdAccountId) {
      // Use the ad account's promote_pages endpoint to get authorized pages
      console.log(`[API] Using Ad Account ${account.metaAdAccountId} to get authorized pages`);
      try {
        pages = await metaService.getPromotePages(account.metaAdAccountId, accessToken);
        console.log(`[API] Found ${pages.length} authorized page(s) for ad account`);
      } catch (err: any) {
        console.warn(`[API] Failed to get promote_pages, falling back to /me/accounts: ${err.message}`);
        // Fallback to all pages if promote_pages fails
        pages = await metaService.getPages(accessToken);
      }
    } else {
      // No ad account ID, use fallback to get all accessible pages
      console.log(`[API] No Ad Account ID, getting all accessible pages`);
      pages = await metaService.getPages(accessToken);
    }

    if (!pages || pages.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No Facebook Pages found for this ad account. Please ensure the ad account has access to at least one Page.',
        },
        { status: 404 }
      );
    }

    console.log(`[API] Found ${pages.length} Fan Page(s) for account ${account.name}`);

    return NextResponse.json({
      success: true,
      data: pages.map(p => ({
        id: p.id,
        name: p.name,
      })),
    });
  } catch (error: any) {
    console.error('[API] Error fetching Fan Pages:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Fan Pages',
      },
      { status: 500 }
    );
  }
}
