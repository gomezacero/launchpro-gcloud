import { NextRequest, NextResponse } from 'next/server';
import { aiService } from '@/services/ai.service';

/**
 * GET /api/diagnostic/test-cron-ai
 *
 * Simulates EXACTLY what the cron does: calls aiService.generateKeywords
 * to test if the AI service works in an HTTP context.
 *
 * If this works but the cron fails, the issue is with Vercel's cron execution environment.
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Log environment state at the start
    const rawKey = process.env.ANTHROPIC_API_KEY || '';
    const cleanKey = rawKey.split('').filter(c => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126).join('');

    const envState = {
      rawKeyLength: rawKey.length,
      cleanKeyLength: cleanKey.length,
      keyPreview: cleanKey ? `${cleanKey.substring(0, 15)}...${cleanKey.substring(cleanKey.length - 6)}` : 'MISSING',
      startsWithSkAnt: cleanKey.startsWith('sk-ant-'),
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV,
      timestamp: new Date().toISOString(),
    };

    console.log('[test-cron-ai] Environment state:', JSON.stringify(envState));

    // Call generateKeywords EXACTLY like the cron does
    console.log('[test-cron-ai] Calling aiService.generateKeywords...');

    const keywords = await aiService.generateKeywords({
      offerName: 'Test Car Loans',
      copyMaster: 'Get the best car loan rates today with easy approval and low monthly payments.',
      count: 6,
      country: 'CO',
    });

    const duration = Date.now() - startTime;

    console.log('[test-cron-ai] SUCCESS! Keywords:', keywords);

    return NextResponse.json({
      success: true,
      message: 'generateKeywords worked successfully',
      durationMs: duration,
      keywords,
      envState,
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;

    console.error('[test-cron-ai] FAILED:', {
      message: error.message,
      status: error.status,
      stack: error.stack?.substring(0, 500),
    });

    return NextResponse.json({
      success: false,
      message: error.message,
      status: error.status || 'unknown',
      durationMs: duration,
      errorType: error.constructor?.name,
      envState: {
        rawKeyLength: (process.env.ANTHROPIC_API_KEY || '').length,
        cleanKeyLength: (process.env.ANTHROPIC_API_KEY || '').split('').filter((c: string) => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126).join('').length,
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV,
      },
    }, { status: 500 });
  }
}
