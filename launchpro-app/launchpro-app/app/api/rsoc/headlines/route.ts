import { NextRequest, NextResponse } from 'next/server';
import { tonicService, TonicCredentials } from '@/services/tonic.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

export interface TonicHeadline {
  headline_id: number;
  offer_id: number;
  offer_name: string;
  country: string;
  language: string;
  headline: string;
  teaser?: string;
  status?: string;
  created_at?: string;
}

/**
 * GET /api/rsoc/headlines
 * Get all available RSOC headlines (articles) from Tonic
 *
 * Query params:
 * - tonicAccountId: (optional) Specific Tonic account to use
 * - offerId: (optional) Filter by offer ID
 * - country: (optional) Filter by country code
 *
 * Returns headlines that can be reused for new campaigns
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const tonicAccountId = searchParams.get('tonicAccountId');
    const filterOfferId = searchParams.get('offerId');
    const filterCountry = searchParams.get('country');

    logger.info('api', `GET /api/rsoc/headlines - tonicAccountId: ${tonicAccountId || 'auto'}, offerId: ${filterOfferId || 'all'}, country: ${filterCountry || 'all'}`);

    // Get Tonic account (specific or first active)
    let tonicAccount;
    if (tonicAccountId) {
      tonicAccount = await prisma.account.findFirst({
        where: {
          id: tonicAccountId,
          accountType: 'TONIC',
          isActive: true,
        },
      });
    } else {
      tonicAccount = await prisma.account.findFirst({
        where: {
          accountType: 'TONIC',
          isActive: true,
        },
      });
    }

    if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      logger.error('api', 'No active Tonic account found');
      return NextResponse.json(
        {
          success: false,
          error: 'No active Tonic account configured.',
        },
        { status: 503 }
      );
    }

    const credentials: TonicCredentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    logger.info('tonic', `Fetching RSOC headlines using account: ${tonicAccount.name}`);

    // Fetch headlines from Tonic API
    const headlines: TonicHeadline[] = await tonicService.getHeadlines(credentials);

    // Filter by offer and/or country if provided
    let filteredHeadlines = headlines || [];

    if (filterOfferId) {
      // IMPORTANT: filterOfferId from frontend is LaunchPro CUID, but Tonic uses numeric IDs
      // Resolve LaunchPro offerId → Tonic offer_id (tonicId)
      let tonicOfferId = filterOfferId;
      const offer = await prisma.offer.findUnique({
        where: { id: filterOfferId },
        select: { tonicId: true }
      });
      if (offer?.tonicId) {
        tonicOfferId = offer.tonicId;
        logger.info('api', `Resolved offerId ${filterOfferId} → tonicId ${tonicOfferId}`);
      }
      // Compare as strings since Tonic API returns offer_id as string/number
      filteredHeadlines = filteredHeadlines.filter(h => String(h.offer_id) === String(tonicOfferId));
    }

    if (filterCountry) {
      filteredHeadlines = filteredHeadlines.filter(
        h => h.country?.toLowerCase() === filterCountry.toLowerCase()
      );
    }

    // Sort by headline_id descending (newest first)
    filteredHeadlines.sort((a, b) => (b.headline_id || 0) - (a.headline_id || 0));

    const duration = Date.now() - startTime;
    logger.success('api', `Successfully fetched ${filteredHeadlines.length} RSOC headlines`, {
      total: headlines?.length || 0,
      filtered: filteredHeadlines.length,
      filterOfferId,
      filterCountry,
    }, duration);

    return NextResponse.json({
      success: true,
      data: filteredHeadlines,
      meta: {
        total: headlines?.length || 0,
        filtered: filteredHeadlines.length,
        tonicAccountId: tonicAccount.id,
        tonicAccountName: tonicAccount.name,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching RSOC headlines: ${error.message}`, {
      stack: error.stack,
      response: error.response?.data,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch headlines from Tonic',
        details: error.response?.data || null,
      },
      { status: 500 }
    );
  }
}
