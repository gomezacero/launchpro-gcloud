import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/generate-images
 * Generate AI images for campaign preview in the wizard
 * Supports generating 1-5 images at once
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { count, category, country, language, adTitle, copyMaster, platform } = body;

    // Validate required fields
    if (!count || !category || !country || !language || !adTitle) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: count, category, country, language, adTitle' },
        { status: 400 }
      );
    }

    // Validate count (1-5)
    const imageCount = Math.min(Math.max(parseInt(count, 10) || 1, 1), 5);

    logger.info('ai', `Generating ${imageCount} preview image(s) for wizard`, {
      category,
      country,
      language,
      platform: platform || 'META'
    });

    const images: { url: string; gcsPath: string; prompt: string }[] = [];

    // Generate images one by one
    for (let i = 0; i < imageCount; i++) {
      try {
        logger.info('ai', `Generating preview image ${i + 1}/${imageCount}...`);

        const result = await aiService.generateImageForPreview({
          category,
          country,
          language,
          adTitle,
          copyMaster: copyMaster || '',
        });

        images.push(result);
        logger.success('ai', `Preview image ${i + 1}/${imageCount} generated successfully`);
      } catch (error: any) {
        logger.error('ai', `Failed to generate preview image ${i + 1}: ${error.message}`);
        // Continue with other images even if one fails
        // Don't throw - we want to return partial results
      }
    }

    if (images.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Failed to generate any images' },
        { status: 500 }
      );
    }

    logger.success('ai', `Generated ${images.length}/${imageCount} preview images`, { category });

    return NextResponse.json({
      success: true,
      data: { images }
    });

  } catch (error: any) {
    logger.error('ai', `Error generating preview images: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
