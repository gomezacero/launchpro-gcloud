import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

/**
 * GET /api/managers/[id]
 * Get a specific manager's data - SUPERADMIN only
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    const { id } = await params;

    logger.info('api', `GET /api/managers/${id} - User: ${user!.email}`);

    const manager = await prisma.manager.findUnique({
      where: { id },
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
    });

    if (!manager) {
      return NextResponse.json(
        { success: false, error: 'Manager not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: manager,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching manager: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/managers/[id]
 * Update a manager's data - SUPERADMIN only
 * Currently supports updating: lookerReportUrl
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireSuperAdmin();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    logger.info('api', `PATCH /api/managers/${id} - User: ${user!.email}`, { body });

    // Validate manager exists
    const existingManager = await prisma.manager.findUnique({
      where: { id },
    });

    if (!existingManager) {
      return NextResponse.json(
        { success: false, error: 'Manager not found' },
        { status: 404 }
      );
    }

    // Build update data - only allow specific fields
    const updateData: { lookerReportUrl?: string | null } = {};

    if (body.lookerReportUrl !== undefined) {
      // Validate URL format if provided
      if (body.lookerReportUrl && body.lookerReportUrl.trim() !== '') {
        const url = body.lookerReportUrl.trim();
        if (!url.startsWith('https://lookerstudio.google.com/')) {
          return NextResponse.json(
            { success: false, error: 'Invalid Looker Studio URL. Must start with https://lookerstudio.google.com/' },
            { status: 400 }
          );
        }
        updateData.lookerReportUrl = url;
      } else {
        // Allow clearing the URL
        updateData.lookerReportUrl = null;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const updatedManager = await prisma.manager.update({
      where: { id },
      data: updateData,
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

    logger.success('api', `Manager ${id} updated successfully`, { updateData });

    return NextResponse.json({
      success: true,
      data: updatedManager,
    });
  } catch (error: any) {
    logger.error('api', `Error updating manager: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
