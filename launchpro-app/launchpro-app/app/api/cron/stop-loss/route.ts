import { NextRequest, NextResponse } from 'next/server';
import { stopLossService } from '@/services/stop-loss.service';
import { logger } from '@/lib/logger';

/**
 * GET /api/cron/stop-loss
 * Cron job to check for stop-loss violations
 *
 * Runs every 15 minutes
 * Checks all ACTIVE campaigns for:
 * - IMMEDIATE_LOSS: Net Revenue <= -$35 USD
 * - TIME_BASED_LOSS: Active >= 48 hours AND Net Revenue <= -$10 USD
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === 'production' && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn('cron', 'Unauthorized stop-loss cron request');
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    logger.info('cron', 'Starting stop-loss monitoring cron job');

    // Check all active campaigns for violations
    const result = await stopLossService.checkAllActiveCampaigns();

    const duration = Date.now() - startTime;
    logger.success('cron', 'Stop-loss monitoring complete', {
      campaignsChecked: result.campaignsChecked,
      violationsFound: result.violationsFound,
      alertsSent: result.alertsSent,
      errors: result.errors.length,
    }, duration);

    return NextResponse.json({
      success: true,
      data: {
        campaignsChecked: result.campaignsChecked,
        violationsFound: result.violationsFound,
        alertsSent: result.alertsSent,
        errors: result.errors,
        durationMs: duration,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('cron', `Stop-loss cron failed: ${error.message}`, { error, duration });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
