import { NextRequest, NextResponse } from 'next/server';
import { tonicService, TonicCredentials } from '@/services/tonic.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import {
  isCountryAllowed,
  WORLDWIDE_OPTION,
  ALLOWED_COUNTRIES
} from '@/lib/allowed-countries';

/**
 * GET /api/countries
 * Get all available countries from Tonic
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') as 'display' | 'rsoc') || 'display';
    const offerId = searchParams.get('offerId');

    logger.info('api', `GET /api/countries - type: ${type}${offerId ? `, offerId: ${offerId}` : ''}`);

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
          error: 'No active Tonic account configured.',
        },
        { status: 503 }
      );
    }

    const credentials: TonicCredentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    let tonicCountries;

    if (offerId) {
      tonicCountries = await tonicService.getCountriesForOffer(credentials, parseInt(offerId), type);
    } else {
      tonicCountries = await tonicService.getCountries(credentials, type);
    }

    // Filter countries to only include allowed GEOs (Tonic restrictions as of Jan 2026)
    const filteredCountries = tonicCountries?.filter((country: { code: string }) =>
      isCountryAllowed(country.code)
    ) || [];

    // Add WORLDWIDE option at the beginning
    const countriesWithWorldwide = [
      { code: WORLDWIDE_OPTION.code, name: WORLDWIDE_OPTION.name },
      ...filteredCountries,
    ];

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${filteredCountries.length} allowed countries (filtered from ${tonicCountries?.length || 0} Tonic countries)`, {
      allowedCount: filteredCountries.length,
      tonicCount: tonicCountries?.length || 0,
      blockedCount: (tonicCountries?.length || 0) - filteredCountries.length,
    }, duration);

    return NextResponse.json({
      success: true,
      data: countriesWithWorldwide,
      meta: {
        totalAllowed: filteredCountries.length,
        hasWorldwide: true,
        note: 'Countries filtered based on Tonic GEO restrictions. WORLDWIDE targets all 87 allowed countries.',
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching countries: ${error.message}`, {
      stack: error.stack,
      response: error.response?.data,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch countries from Tonic',
        details: error.response?.data || null,
      },
      { status: 500 }
    );
  }
}
