import { NextRequest, NextResponse } from 'next/server';
import { dashboardService } from '@/services/dashboard.service';
import { requireAuth, isSuperAdmin } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/dashboard/metrics
 * Get dashboard metrics for a manager
 *
 * Query params:
 * - managerId (optional): For SUPERADMIN to view specific manager's dashboard
 *
 * Access:
 * - MANAGER: Can only view their own dashboard
 * - SUPERADMIN: Can view any manager's dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const requestedManagerId = searchParams.get('managerId');

    // Determine which manager's dashboard to show
    let targetManagerId: string;

    if (isSuperAdmin(user)) {
      // SUPERADMIN can view any manager's dashboard
      targetManagerId = requestedManagerId || user!.id;
    } else {
      // MANAGER can only view their own dashboard
      if (requestedManagerId && requestedManagerId !== user!.id) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Cannot view other manager dashboards' },
          { status: 403 }
        );
      }
      targetManagerId = user!.id;
    }

    logger.info('api', `GET /api/dashboard/metrics - User: ${user!.email}, Target: ${targetManagerId}`);

    const metrics = await dashboardService.getDashboardMetrics(targetManagerId);

    if (!metrics) {
      return NextResponse.json(
        { success: false, error: 'Manager not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: metrics,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching dashboard metrics: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
