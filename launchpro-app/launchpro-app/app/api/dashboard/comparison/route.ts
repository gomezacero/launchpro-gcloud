import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from '@/services/dashboard.service';
import { requireSuperAdmin } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/dashboard/comparison
 * Get comparison data for all managers
 *
 * Access: SUPERADMIN only
 *
 * Returns metrics for all managers with rankings
 */
export async function GET(request: NextRequest) {
  try {
    // Only SUPERADMIN can access comparison
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    logger.info('api', `GET /api/dashboard/comparison - User: ${user!.email}`);

    const comparison = await dashboardService.getManagerComparison();

    return NextResponse.json({
      success: true,
      data: comparison,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching manager comparison: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
