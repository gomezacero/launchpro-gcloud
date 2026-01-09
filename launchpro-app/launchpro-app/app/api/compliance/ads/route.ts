import { NextRequest, NextResponse } from 'next/server';
import { complianceService } from '@/services/compliance.service';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/compliance/ads
 * Get compliance ads with filters
 *
 * Query params:
 * - networks: Comma-separated networks (facebook,tiktok,taboola)
 * - status: 'allowed' | 'declined' | 'all'
 * - campaignId: Filter by campaign ID
 * - campaignName: Filter by campaign name (partial match)
 * - hasReviewRequest: Filter by review request status
 * - limit: Number of results per page (default 50)
 * - offset: Pagination offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);

    // Parse filters
    const networks = searchParams.get('networks');
    const status = searchParams.get('status') as 'allowed' | 'declined' | 'all' | null;
    const campaignId = searchParams.get('campaignId');
    const campaignName = searchParams.get('campaignName');
    const hasReviewRequest = searchParams.get('hasReviewRequest');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const filters = {
      networks: networks ? networks.split(',') : undefined,
      status: status || 'all',
      campaignId: campaignId ? parseInt(campaignId, 10) : undefined,
      campaignName: campaignName || undefined,
      hasReviewRequest: hasReviewRequest === 'true' ? true : hasReviewRequest === 'false' ? false : undefined,
      limit,
      offset,
    };

    logger.info('api', `GET /api/compliance/ads - User: ${user!.email}`, { filters });

    const result = await complianceService.getComplianceAds(filters);

    return NextResponse.json({
      success: true,
      data: result.ads,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error: any) {
    logger.error('api', `Error fetching compliance ads: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
