import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaService } from '@/services/meta.service';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/accounts/[id]/meta-campaigns
 * Get active campaigns directly from Meta API for a specific account
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    logger.info('api', `GET /api/accounts/${id}/meta-campaigns`);

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

    if (account.accountType !== 'META') {
      return NextResponse.json(
        { success: false, error: 'Account is not a Meta account' },
        { status: 400 }
      );
    }

    if (!account.metaAdAccountId) {
      return NextResponse.json(
        { success: false, error: 'Meta account missing Ad Account ID. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    // Get access token - use account-specific or fall back to global
    let accessToken = account.metaAccessToken;
    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findFirst();
      accessToken = globalSettings?.metaAccessToken || null;
    }

    if (!accessToken) {
      return NextResponse.json(
        { success: false, error: 'No Meta access token available. Please configure it in Settings.' },
        { status: 400 }
      );
    }

    // Fetch active campaigns from Meta API
    const campaigns = await metaService.getActiveCampaigns(account.metaAdAccountId, accessToken);

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${campaigns.length} Meta campaigns`, { accountId: id }, duration);

    return NextResponse.json({
      success: true,
      data: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
      })),
    });
  } catch (error: any) {
    logger.error('api', `Error fetching Meta campaigns: ${error.message}`, {
      accountId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
