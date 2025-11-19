import { NextRequest, NextResponse } from 'next/server';
import { tonicService } from '@/services/tonic.service';

/**
 * GET /api/countries
 * Get all available countries from Tonic
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') as 'display' | 'rsoc') || 'display';
    const offerId = searchParams.get('offerId');

    let countries;

    if (offerId) {
      countries = await tonicService.getCountriesForOffer(parseInt(offerId), type);
    } else {
      countries = await tonicService.getCountries(type);
    }

    return NextResponse.json({
      success: true,
      data: countries,
    });
  } catch (error: any) {
    console.error('Error fetching countries:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
