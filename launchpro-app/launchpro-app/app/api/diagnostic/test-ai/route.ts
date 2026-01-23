import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';

/**
 * GET /api/diagnostic/test-ai
 *
 * Test endpoint that calls aiService directly (same as cron does)
 * This helps diagnose why the cron gets 401 but diagnostic endpoint works
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Log environment info first
    const envInfo = {
      anthropicKeyExists: !!process.env.ANTHROPIC_API_KEY,
      anthropicKeyLength: (process.env.ANTHROPIC_API_KEY || '').length,
      anthropicKeyStart: (process.env.ANTHROPIC_API_KEY || '').substring(0, 20),
      anthropicKeyEnd: (process.env.ANTHROPIC_API_KEY || '').substring(-6),
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
    };

    console.log('[test-ai] Environment info:', JSON.stringify(envInfo));

    // Test 1: Generate Copy Master (same as cron)
    console.log('[test-ai] Testing generateCopyMaster...');
    const copyMaster = await aiService.generateCopyMaster({
      offerName: 'Test Offer for Debugging',
      offerDescription: 'This is a test to debug the 401 error',
      vertical: 'Finance',
      country: 'US',
      language: 'en',
    });

    console.log('[test-ai] ✅ generateCopyMaster succeeded:', copyMaster.substring(0, 50));

    // Test 2: Generate Keywords (same as cron)
    console.log('[test-ai] Testing generateKeywords...');
    const keywords = await aiService.generateKeywords({
      offerName: 'Test Offer for Debugging',
      copyMaster: copyMaster,
      count: 6,
      country: 'US',
    });

    console.log('[test-ai] ✅ generateKeywords succeeded:', keywords);

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      duration,
      envInfo,
      results: {
        copyMaster: copyMaster.substring(0, 100) + '...',
        keywords,
      },
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error('[test-ai] ❌ Error:', {
      status: error.status,
      message: error.message,
      stack: error.stack?.substring(0, 500),
    });

    return NextResponse.json({
      success: false,
      duration,
      error: {
        status: error.status,
        message: error.message,
        type: error.constructor?.name,
      },
    }, { status: 500 });
  }
}
