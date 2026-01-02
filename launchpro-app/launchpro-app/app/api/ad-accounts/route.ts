import { NextRequest, NextResponse } from 'next/server';
import { metaService } from '@/services/meta.service';
import { tiktokService } from '@/services/tiktok.service';
import { taboolaService } from '@/services/taboola.service';
import { env } from '@/lib/env';

/**
 * GET /api/ad-accounts
 * Fetches ad accounts from Meta, TikTok, and Taboola APIs
 *
 * Query params:
 * - platform: 'meta' | 'tiktok' | 'taboola' | 'all' (default: 'all')
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform') || 'all';

    const result: {
      meta?: any[];
      tiktok?: any[];
      taboola?: any[];
    } = {};

    // Fetch Meta ad accounts
    if (platform === 'meta' || platform === 'all') {
      try {
        const metaAccounts = await metaService.getAdAccounts();
        result.meta = metaAccounts.data || [];
      } catch (error: any) {
        console.error('Error fetching Meta ad accounts:', error);
        result.meta = [];
      }
    }

    // Fetch TikTok advertiser accounts
    if (platform === 'tiktok' || platform === 'all') {
      try {
        const tiktokAccounts = await tiktokService.getAdvertiserAccounts();
        result.tiktok = tiktokAccounts.list || [];
      } catch (error: any) {
        console.error('Error fetching TikTok advertiser accounts:', error);
        result.tiktok = [];
      }
    }

    // Fetch Taboola advertiser accounts
    if (platform === 'taboola' || platform === 'all') {
      try {
        // Only fetch if Taboola credentials are configured
        if (env.TABOOLA_CLIENT_ID && env.TABOOLA_CLIENT_SECRET) {
          await taboolaService.getAccessToken();
          const taboolaAccounts = await taboolaService.getAllowedAccounts();
          // Filter to only advertiser accounts
          result.taboola = taboolaAccounts.filter(
            (acc) => acc.partner_types?.includes('ADVERTISER')
          );
        } else {
          result.taboola = [];
        }
      } catch (error: any) {
        console.error('Error fetching Taboola advertiser accounts:', error);
        result.taboola = [];
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Error in /api/ad-accounts:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch ad accounts',
      },
      { status: 500 }
    );
  }
}
