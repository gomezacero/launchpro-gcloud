import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/ad-copy-suggestions
 * Generate 5 Ad Copy suggestions for Meta or TikTok ads
 * Meta: headline (40 chars), primaryText (125 chars), description (30 chars)
 * TikTok: adText (100 chars)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { offerName, copyMaster, platform, country, language } = body;

    // Validate required fields
    if (!offerName || !copyMaster || !platform || !country || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: offerName, copyMaster, platform, country, language' },
        { status: 400 }
      );
    }

    // Validate platform
    if (!['META', 'TIKTOK'].includes(platform)) {
      return NextResponse.json(
        { success: false, error: 'Platform must be META or TIKTOK' },
        { status: 400 }
      );
    }

    logger.info('ai', `Generating ad copy suggestions for ${platform}`, { offerName, country, language });

    // Generate suggestions using AI service
    const suggestions = await aiService.generateAdCopySuggestions({
      offerName,
      copyMaster,
      platform,
      country,
      language,
    });

    const count = platform === 'META' ? suggestions.meta?.length : suggestions.tiktok?.length;
    logger.success('ai', `Generated ${count} ad copy suggestions for ${platform}`, { offerName });

    return NextResponse.json({
      success: true,
      data: suggestions
    });

  } catch (error: any) {
    logger.error('ai', `Error generating ad copy suggestions: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
