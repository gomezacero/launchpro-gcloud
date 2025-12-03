import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/copy-suggestions
 * Generate 5 Copy Master suggestions using CopyBot 7.1 RSOC compliance rules
 *
 * Note: Offer data is sent directly from frontend since offers come from Tonic API,
 * not from local database.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerName, offerVertical, country, language } = body;

    // Validate required fields
    if (!offerName || !country || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: offerName, country, language' },
        { status: 400 }
      );
    }

    logger.info('ai', `Generating copy suggestions for offer: ${offerName}`, { country, language });

    // Generate suggestions using AI service
    const suggestions = await aiService.generateCopyMasterSuggestions({
      offerName,
      vertical: offerVertical || undefined,
      country,
      language,
    });

    logger.success('ai', `Generated ${suggestions.length} copy suggestions`, { offerName });

    return NextResponse.json({
      success: true,
      data: { suggestions }
    });

  } catch (error: any) {
    logger.error('ai', `Error generating copy suggestions: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
