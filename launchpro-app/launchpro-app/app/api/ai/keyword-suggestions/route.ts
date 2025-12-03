import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/keyword-suggestions
 * Generate 10 keyword suggestions using SEO Senior Specialist methodology
 * Distribution: 5 financial, 1 geographic, 2 need, 2 urgency
 *
 * Note: Category is sent directly from frontend (offerName or vertical)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { category, country, language } = body;

    // Validate required fields
    if (!category || !country || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: category, country, language' },
        { status: 400 }
      );
    }

    logger.info('ai', `Generating keyword suggestions for: ${category}`, { country, language });

    // Generate suggestions using AI service
    const suggestions = await aiService.generateKeywordsSuggestions({
      category,
      country,
      language,
    });

    logger.success('ai', `Generated ${suggestions.length} keyword suggestions`, { category });

    return NextResponse.json({
      success: true,
      data: { suggestions }
    });

  } catch (error: any) {
    logger.error('ai', `Error generating keyword suggestions: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
