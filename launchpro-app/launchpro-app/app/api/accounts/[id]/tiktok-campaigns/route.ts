import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tiktokService } from '@/services/tiktok.service';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/accounts/[id]/tiktok-campaigns
 * Get active campaigns directly from TikTok API for a specific account
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    logger.info('api', `GET /api/accounts/${id}/tiktok-campaigns`);

    // Get the account
    const account = await prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: 'Account not found' },
        { status: 404 }
      );
    }

    if (account.accountType !== 'TIKTOK') {
      return NextResponse.json(
        { success: false, error: 'Account is not a TikTok account' },
        { status: 400 }
      );
    }

    if (!account.tiktokAdvertiserId) {
      return NextResponse.json(
        { success: false, error: 'TikTok account missing Advertiser ID. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    // Get access token - use account-specific or fall back to global
    let accessToken = account.tiktokAccessToken;
    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findFirst();
      accessToken = globalSettings?.tiktokAccessToken || null;
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No TikTok access token available. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    // Fetch active campaigns from TikTok API
    const campaigns = await tiktokService.getActiveCampaigns(account.tiktokAdvertiserId, accessToken);

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${campaigns.length} TikTok campaigns`, { accountId: id }, duration);

    return NextResponse.json({
      success: true,
      data: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
      })),
    });
  } catch (error: any) {
    logger.error('api', `Error fetching TikTok campaigns: ${error.message}`, {
      accountId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
