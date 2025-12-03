import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/copy-suggestions
 * Generate 5 Copy Master suggestions using CopyBot 7.1 RSOC compliance rules
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerId, country, language } = body;

    // Validate required fields
    if (!offerId || !country || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: offerId, country, language' },
        { status: 400 }
      );
    }

    logger.info('ai', `Generating copy suggestions for offer ${offerId}`, { country, language });

    // Get offer information
    const offer = await prisma.offer.findUnique({
      where: { id: offerId }
    });

    if (!offer) {
      return NextResponse.json(
        { success: false, error: 'Offer not found' },
        { status: 404 }
      );
    }

    // Generate suggestions using AI service
    const suggestions = await aiService.generateCopyMasterSuggestions({
      offerName: offer.name,
      offerDescription: offer.description || undefined,
      vertical: offer.vertical || undefined,
      country,
      language,
    });

    logger.success('ai', `Generated ${suggestions.length} copy suggestions`, { offerId });

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
