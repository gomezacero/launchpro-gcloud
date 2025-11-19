import { NextRequest, NextResponse } from 'next/server';
import { metaService } from '@/services/meta.service';
import { tiktokService } from '@/services/tiktok.service';

/**
 * GET /api/ad-accounts
 * Fetches ad accounts from Meta and TikTok APIs
 *
 * Query params:
 * - platform: 'meta' | 'tiktok' | 'all' (default: 'all')
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform') || 'all';

    const result: {
      meta?: any[];
      tiktok?: any[];
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
