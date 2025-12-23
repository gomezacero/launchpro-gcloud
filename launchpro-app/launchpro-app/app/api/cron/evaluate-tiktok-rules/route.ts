import { NextRequest, NextResponse } from 'next/server';
import { tiktokAdRulesService } from '@/services/tiktok-ad-rules.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/evaluate-tiktok-rules
 * Cron job to evaluate all active TikTok ad rules
 *
 * This endpoint is called by Vercel Cron every 15 minutes
 * Protected by CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret (Vercel sends it in the Authorization header)
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // In development, allow requests without auth
    if (process.env.NODE_ENV === 'production' && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn('cron', 'Unauthorized TikTok cron request');
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    logger.info('cron', 'Starting TikTok ad rules evaluation cron job');

    // Evaluate all active TikTok rules
    const result = await tiktokAdRulesService.evaluateAllRules();

    const duration = Date.now() - startTime;
    logger.success('cron', 'TikTok ad rules evaluation complete', {
      totalRules: result.totalRules,
      evaluated: result.evaluated,
      triggered: result.triggered,
      errors: result.errors,
    }, duration);

    return NextResponse.json({
      success: true,
      platform: 'TikTok',
      data: {
        totalRules: result.totalRules,
        evaluated: result.evaluated,
        triggered: result.triggered,
        errors: result.errors,
        executionTimeMs: duration,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('cron', `TikTok ad rules evaluation failed: ${error.message}`, {
      stack: error.stack,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering from admin
export async function POST(request: NextRequest) {
  return GET(request);
}
