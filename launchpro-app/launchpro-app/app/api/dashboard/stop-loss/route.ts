import { NextRequest, NextResponse } from 'next/server';
import { stopLossService } from '@/services/stop-loss.service';
import { requireAuth, isSuperAdmin } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/dashboard/stop-loss
 * Get stop-loss violations for a manager
 *
 * Query params:
 * - managerId (optional): For SUPERADMIN to view specific manager's violations
 * - includeAcknowledged (optional): Include acknowledged violations (default: false)
 *
 * Access:
 * - MANAGER: Can only view their own violations
 * - SUPERADMIN: Can view any manager's violations
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const requestedManagerId = searchParams.get('managerId');
    const includeAcknowledged = searchParams.get('includeAcknowledged') === 'true';

    // Determine which manager's violations to show
    let targetManagerId: string;

    if (isSuperAdmin(user)) {
      targetManagerId = requestedManagerId || user!.id;
    } else {
      if (requestedManagerId && requestedManagerId !== user!.id) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Cannot view other manager violations' },
          { status: 403 }
        );
      }
      targetManagerId = user!.id;
    }

    logger.info('api', `GET /api/dashboard/stop-loss - User: ${user!.email}, Target: ${targetManagerId}`);

    // Build query
    const whereClause: any = { managerId: targetManagerId };
    if (!includeAcknowledged) {
      whereClause.acknowledgedAt = null;
    }

    const violations = await prisma.stopLossViolation.findMany({
      where: whereClause,
      include: {
        campaign: {
          select: { id: true, name: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: {
        violations,
        count: violations.length,
        activeCount: violations.filter((v) => !v.acknowledgedAt).length,
      },
    });
  } catch (error: any) {
    logger.error('api', `Error fetching stop-loss violations: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/dashboard/stop-loss
 * Acknowledge a stop-loss violation
 *
 * Body:
 * - violationId: string
 *
 * Access:
 * - MANAGER: Can only acknowledge their own violations
 * - SUPERADMIN: Can acknowledge any violation
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const body = await request.json();
    const { violationId } = body;

    if (!violationId) {
      return NextResponse.json(
        { success: false, error: 'violationId is required' },
        { status: 400 }
      );
    }

    logger.info('api', `POST /api/dashboard/stop-loss - User: ${user!.email}, Violation: ${violationId}`);

    // Get violation to check ownership
    const violation = await prisma.stopLossViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return NextResponse.json(
        { success: false, error: 'Violation not found' },
        { status: 404 }
      );
    }

    // Check access
    if (!isSuperAdmin(user) && violation.managerId !== user!.id) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cannot acknowledge other manager violations' },
        { status: 403 }
      );
    }

    // Acknowledge the violation
    const acknowledged = await stopLossService.acknowledgeViolation(violationId);

    if (!acknowledged) {
      return NextResponse.json(
        { success: false, error: 'Failed to acknowledge violation' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Violation acknowledged successfully',
    });
  } catch (error: any) {
    logger.error('api', `Error acknowledging stop-loss violation: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
