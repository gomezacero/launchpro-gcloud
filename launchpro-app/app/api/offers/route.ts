import { NextRequest, NextResponse } from 'next/server';
import { tonicService } from '@/services/tonic.service';

/**
 * GET /api/offers
 * Get all available offers from Tonic
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') as 'display' | 'rsoc') || 'display';
    const country = searchParams.get('country');

    let offers;

    if (country) {
      offers = await tonicService.getOffersForCountry(country, type);
    } else {
      offers = await tonicService.getOffers(type);
    }

    return NextResponse.json({
      success: true,
      data: offers,
    });
  } catch (error: any) {
    console.error('Error fetching offers:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
