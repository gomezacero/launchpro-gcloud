import { NextRequest, NextResponse } from 'next/server';
import { getNeuralEngineOrchestrator } from '@/services/neural-engine/orchestrator';
import { logger } from '@/lib/logger';
import { NeuralEngineInput, VisualStyleType } from '@/services/neural-engine/types';

/**
 * POST /api/ai/generate-images-neural
 * Generate AI images using the Neural Engine Pipeline (5-agent system)
 *
 * This endpoint provides more sophisticated image generation compared to
 * the basic /api/ai/generate-images endpoint, including:
 * - Cultural context awareness (Global Scout)
 * - Historical performance data (Asset Manager)
 * - Strategic angle selection (Angle Strategist)
 * - Optimized visual prompts (Visual Engineer)
 * - Compliance-safe assembly (Compliance Assembler)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      offerId,
      offerName,
      vertical,
      country,
      language,
      platform = 'META',
      copyMaster,
      visualStyle = 'photography',
      includeTextOverlay = true,
      customTextOverlay,
      previewMode = true, // Optimize for faster preview
    } = body;

    // Validate required fields
    if (!offerName || !country || !language) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: offerName, country, language' },
        { status: 400 }
      );
    }

    // Validate visual style
    const validStyles: VisualStyleType[] = [
      'photography',
      'ugc',
      'graphic_design',
      'text_centric',
      'editorial',
      'minimalist',
    ];
    const selectedStyle = validStyles.includes(visualStyle) ? visualStyle : 'photography';

    logger.info('ai', `🧠 Neural Engine Preview Request`, {
      offerName,
      vertical,
      country,
      language,
      platform,
      visualStyle: selectedStyle,
      includeTextOverlay,
      previewMode,
    });

    // Build Neural Engine input
    const neuralInput: NeuralEngineInput = {
      offer: {
        id: offerId || `preview-${Date.now()}`,
        name: offerName,
        vertical: vertical || offerName,
        description: copyMaster || undefined,
      },
      country,
      language,
      platform: platform as 'META' | 'TIKTOK',
      copyMaster: copyMaster || undefined,
      visualStyle: selectedStyle as VisualStyleType,
      includeTextOverlay,
      customTextOverlay: customTextOverlay || undefined,
      useCache: true,
      useFallbackModels: true,
      previewMode: true, // Always preview mode for wizard
    };

    // Execute Neural Engine Pipeline
    const orchestrator = getNeuralEngineOrchestrator();
    const result = await orchestrator.execute(neuralInput);

    const duration = Date.now() - startTime;

    if (!result.success || !result.data) {
      logger.error('ai', `Neural Engine Pipeline failed`, {
        errors: result.errors.map(e => e.error),
        duration,
      });

      return NextResponse.json(
        {
          success: false,
          error: result.errors[0]?.error || 'Neural Engine Pipeline failed',
          details: {
            errors: result.errors,
            warnings: result.warnings,
          },
        },
        { status: 500 }
      );
    }

    // Extract generated images
    const images = result.data.visuals.images.map(img => ({
      url: img.url,
      gcsPath: img.gcsPath,
      width: img.width,
      height: img.height,
      aspectRatio: img.aspectRatio,
      hasTextOverlay: img.hasTextOverlay,
    }));

    // Extract strategy info for UI feedback
    const strategyInfo = {
      angle: result.data.strategy.angle,
      visualConcept: result.data.strategy.visualConcept,
      copyMaster: result.data.copy.copyMaster,
      headline: result.data.copy.headline,
      primaryText: result.data.copy.primaryText,
    };

    logger.success('ai', `Neural Engine Preview completed`, {
      imagesGenerated: images.length,
      duration,
      cacheHits: result.data.metadata.cacheHits.length,
      totalCost: result.data.metadata.totalCost,
    });

    return NextResponse.json({
      success: true,
      data: {
        images,
        strategy: strategyInfo,
        metadata: {
          generationTimeMs: result.data.metadata.generationTimeMs,
          cacheHits: result.data.metadata.cacheHits,
          modelsUsed: result.data.metadata.modelsUsed.map(m => m.model),
          totalCost: result.data.metadata.totalCost,
        },
        warnings: result.warnings,
      },
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('ai', `Error in Neural Engine Preview: ${error.message}`, {
      error,
      duration,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
