import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';
import { logger } from '@/lib/logger';

/**
 * POST /api/ai/ad-copy-suggestions
 * Generate Ad Copy suggestions in 3 sequential steps:
 *
 * type='title': Generate 5 Ad Titles (max 80 chars) - Step 1
 * type='primaryText': Generate 5 Primary Texts (max 120 chars) - Step 2 (requires selectedTitle)
 * type='description': Generate 5 Descriptions (max 120 chars) - Step 3 (requires selectedTitle + selectedPrimaryText)
 *
 * Legacy mode (no type): Generate full Meta/TikTok ad copy (deprecated)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      type,  // 'title' | 'primaryText' | 'description' | undefined (legacy)
      offerName,
      copyMaster,
      platform,
      country,
      language,
      selectedTitle,      // Required for type='primaryText' and 'description'
      selectedPrimaryText // Required for type='description'
    } = body;

    // New sequential flow
    if (type) {
      // Validate common required fields
      if (!offerName || !copyMaster || !country || !language) {
        return NextResponse.json(
          { success: false, error: 'Missing required fields: offerName, copyMaster, country, language' },
          { status: 400 }
        );
      }

      // Handle each step
      switch (type) {
        case 'title': {
          logger.info('ai', `Generating 5 Ad Title suggestions`, { offerName, country, language });

          const suggestions = await aiService.generateAdTitleSuggestions({
            offerName,
            copyMaster,
            country,
            language,
          });

          logger.success('ai', `Generated ${suggestions.length} ad title suggestions`, { offerName });

          return NextResponse.json({
            success: true,
            data: { titles: suggestions }
          });
        }

        case 'primaryText': {
          if (!selectedTitle) {
            return NextResponse.json(
              { success: false, error: 'Missing required field: selectedTitle' },
              { status: 400 }
            );
          }

          logger.info('ai', `Generating 5 Primary Text suggestions`, { offerName, selectedTitle });

          const suggestions = await aiService.generateAdPrimaryTextSuggestions({
            offerName,
            copyMaster,
            selectedTitle,
            country,
            language,
          });

          logger.success('ai', `Generated ${suggestions.length} primary text suggestions`, { offerName });

          return NextResponse.json({
            success: true,
            data: { primaryTexts: suggestions }
          });
        }

        case 'description': {
          if (!selectedTitle || !selectedPrimaryText) {
            return NextResponse.json(
              { success: false, error: 'Missing required fields: selectedTitle, selectedPrimaryText' },
              { status: 400 }
            );
          }

          logger.info('ai', `Generating 5 Description suggestions`, { offerName, selectedTitle });

          const suggestions = await aiService.generateAdDescriptionSuggestions({
            offerName,
            copyMaster,
            selectedTitle,
            selectedPrimaryText,
            country,
            language,
          });

          logger.success('ai', `Generated ${suggestions.length} description suggestions`, { offerName });

          return NextResponse.json({
            success: true,
            data: { descriptions: suggestions }
          });
        }

        default:
          return NextResponse.json(
            { success: false, error: 'Invalid type. Must be: title, primaryText, or description' },
            { status: 400 }
          );
      }
    }

    // Legacy mode (no type specified) - kept for backwards compatibility
    // Validate required fields for legacy mode
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

    logger.info('ai', `[LEGACY] Generating ad copy suggestions for ${platform}`, { offerName, country, language });

    // Generate suggestions using legacy AI service method
    const suggestions = await aiService.generateAdCopySuggestions({
      offerName,
      copyMaster,
      platform,
      country,
      language,
    });

    const count = platform === 'META' ? suggestions.meta?.length : suggestions.tiktok?.length;
    logger.success('ai', `[LEGACY] Generated ${count} ad copy suggestions for ${platform}`, { offerName });

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
