import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/managers/me
 * Get current logged-in manager's data including lookerReportUrl
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    logger.info('api', `GET /api/managers/me - User: ${user!.email}`);

    const manager = await prisma.manager.findUnique({
      where: { id: user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        lookerReportUrl: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!manager) {
      return NextResponse.json(
        { success: false, error: 'Manager not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      manager,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching current manager: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
