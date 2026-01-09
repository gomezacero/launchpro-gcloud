import { NextRequest, NextResponse } from 'next/server';
import { complianceService } from '@/services/compliance.service';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/compliance/changelog
 * Get compliance status change log
 *
 * Query params:
 * - adId: Filter by ad ID
 * - campaignId: Filter by campaign ID
 * - campaignName: Filter by campaign name (partial match)
 * - from: Start date (YYYY-MM-DD)
 * - to: End date (YYYY-MM-DD)
 * - limit: Number of results per page (default 50)
 * - offset: Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);

    // Parse params
    const adId = searchParams.get('adId') || undefined;
    const campaignId = searchParams.get('campaignId');
    const campaignName = searchParams.get('campaignName') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const params = {
      adId,
      campaignId: campaignId ? parseInt(campaignId, 10) : undefined,
      campaignName,
      from,
      to,
      limit,
      offset,
    };

    logger.info('api', `GET /api/compliance/changelog - User: ${user!.email}`, { params });

    const result = await complianceService.getChangeLog(params);

    return NextResponse.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error: any) {
    logger.error('api', `Error fetching compliance changelog: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
