import { NextRequest, NextResponse } from 'next/server';
import { tonicService, TonicCredentials } from '@/services/tonic.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/offers
 * Get all available offers from Tonic
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') as 'display' | 'rsoc') || 'display';
    const country = searchParams.get('country');

    logger.info('api', `GET /api/offers - type: ${type}${country ? `, country: ${country}` : ''}`);

    // Get first active Tonic account from database
    const tonicAccount = await prisma.account.findFirst({
      where: {
        accountType: 'TONIC',
        isActive: true,
      },
    });

    if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      logger.error('api', 'No active Tonic account found in database');
      return NextResponse.json(
        {
          success: false,
          error: 'No active Tonic account configured. Please add Tonic credentials in the database.',
        },
        { status: 503 }
      );
    }

    const credentials: TonicCredentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    logger.info('tonic', `Fetching offers using account: ${tonicAccount.name}`);

    let offers;

    if (country) {
      offers = await tonicService.getOffersForCountry(credentials, country, type);
    } else {
      offers = await tonicService.getOffers(credentials, type);
    }

    const duration = Date.now() - startTime;
    logger.success('api', `Successfully fetched ${offers?.length || 0} offers from Tonic`, { count: offers?.length }, duration);

    return NextResponse.json({
      success: true,
      data: offers,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching offers: ${error.message}`, {
      stack: error.stack,
      response: error.response?.data,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch offers from Tonic',
        details: error.response?.data || null,
      },
      { status: 500 }
    );
  }
}
