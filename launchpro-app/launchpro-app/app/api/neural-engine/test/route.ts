/**
 * Neural Engine Test Endpoint
 *
 * POST /api/neural-engine/test
 *
 * Test the Neural Engine pipeline in isolation without affecting production.
 * Use this to verify the system works before enabling the feature flag.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNeuralEngineOrchestrator } from '@/services/neural-engine';
import { NeuralEngineInput } from '@/services/neural-engine/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.offer || !body.country || !body.platform) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: offer, country, platform',
          example: {
            offer: {
              id: 'test-offer-1',
              name: 'Car Loans Mexico',
              vertical: 'Car Loans',
              description: 'Best car loan rates in Mexico',
            },
            country: 'MX',
            language: 'es',
            platform: 'META',
            useCache: true,
          },
        },
        { status: 400 }
      );
    }

    // Build input
    const input: NeuralEngineInput = {
      offer: {
        id: body.offer.id || 'test-offer',
        name: body.offer.name,
        vertical: body.offer.vertical,
        description: body.offer.description,
        tonicOfferId: body.offer.tonicOfferId,
      },
      country: body.country,
      language: body.language || 'en',
      platform: body.platform,
      communicationAngle: body.communicationAngle,
      copyMaster: body.copyMaster,
      useCache: body.useCache !== false,
      useFallbackModels: body.useFallbackModels !== false,
    };

    console.log('[NeuralEngine/Test] Starting test run:', {
      offer: input.offer.name,
      country: input.country,
      platform: input.platform,
    });

    // Execute the Neural Engine
    const orchestrator = getNeuralEngineOrchestrator();
    const result = await orchestrator.execute(input);

    // Return result
    if (result.success) {
      console.log('[NeuralEngine/Test] Success!', {
        imagesGenerated: result.data?.visuals?.images?.length || 0,
        cacheHits: result.state.cacheHits.length,
        totalTimeMs: result.state.timing.totalMs,
      });

      return NextResponse.json({
        success: true,
        data: {
          creativePackage: result.data,
          timing: result.state.timing,
          cacheHits: result.state.cacheHits,
          costEstimate: orchestrator.estimateCost(input),
        },
      });
    } else {
      console.error('[NeuralEngine/Test] Failed:', result.errors);

      return NextResponse.json(
        {
          success: false,
          errors: result.errors,
          state: {
            timing: result.state.timing,
            culturalContextGenerated: !!result.state.culturalContext,
            assetsRetrieved: !!result.state.retrievedAssets,
            strategyGenerated: !!result.state.strategyBrief,
            promptsGenerated: !!result.state.visualPrompts,
          },
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('[NeuralEngine/Test] Unexpected error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unexpected error',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/neural-engine/test
 *
 * Get system status and cost estimates
 */
export async function GET() {
  try {
    const orchestrator = getNeuralEngineOrchestrator();

    // Sample cost estimate
    const sampleCost = orchestrator.estimateCost({
      offer: { id: 'sample', name: 'Sample', vertical: 'Insurance' },
      country: 'US',
      language: 'en',
      platform: 'META',
    });

    return NextResponse.json({
      success: true,
      status: 'ready',
      version: '1.0.0',
      agents: [
        { name: 'GlobalScout', model: 'gemini-2.0-flash', purpose: 'Cultural research' },
        { name: 'AssetManager', model: 'text-embedding-004', purpose: 'RAG retrieval' },
        { name: 'AngleStrategist', model: 'claude-3.5-sonnet', purpose: 'Creative strategy' },
        { name: 'VisualEngineer', model: 'gemini-2.0-flash', purpose: 'Prompt generation' },
        { name: 'ComplianceAssembler', model: 'imagen-3.0', purpose: 'Image generation' },
      ],
      costEstimate: sampleCost,
      usage: {
        example: 'POST /api/neural-engine/test with body containing offer, country, platform',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
