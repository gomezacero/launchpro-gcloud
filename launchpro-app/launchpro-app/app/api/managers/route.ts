import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/managers
 * Get all managers - SUPERADMIN only
 * Used for filtering campaigns by manager and dashboard comparison
 */
export async function GET(request: NextRequest) {
  try {
    // Only SUPERADMIN can list all managers
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    logger.info('api', `GET /api/managers - User: ${user!.email}`);

    // Get all managers excluding SUPERADMIN (for dashboard dropdown)
    const managers = await prisma.manager.findMany({
      where: {
        role: 'MANAGER', // Only show regular managers, not SUPERADMIN
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lookerReportUrl: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: { campaigns: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    logger.info('api', `Found ${managers.length} managers`);

    return NextResponse.json({
      success: true,
      data: managers,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching managers: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
