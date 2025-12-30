import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth-utils';

/**
 * GET /api/managers
 * Get all managers - SUPERADMIN only
 * Used for filtering campaigns by manager
 */
export async function GET(request: NextRequest) {
  try {
    // Only SUPERADMIN can list all managers
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    const managers = await prisma.manager.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: { campaigns: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: managers,
    });
  } catch (error: any) {
    console.error('Error fetching managers:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
