import { NextRequest, NextResponse } from 'next/server';
import { complianceService } from '@/services/compliance.service';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/compliance/ads/[id]
 * Get details for a specific ad
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id: adId } = await params;

    logger.info('api', `GET /api/compliance/ads/${adId} - User: ${user!.email}`);

    const ad = await complianceService.getAdDetails(adId);

    if (!ad) {
      return NextResponse.json(
        { success: false, error: 'Ad not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: ad,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching ad details: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
