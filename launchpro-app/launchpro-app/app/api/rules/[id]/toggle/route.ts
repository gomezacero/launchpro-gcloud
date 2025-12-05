import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/rules/[id]/toggle
 * Toggle a rule's active status
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    logger.info('api', `POST /api/rules/${id}/toggle`);

    // Get current rule
    const existingRule = await prisma.adRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }

    // Toggle active status
    const rule = await prisma.adRule.update({
      where: { id },
      data: {
        isActive: !existingRule.isActive,
      },
      include: {
        metaAccount: {
          select: {
            id: true,
            name: true,
            metaAdAccountId: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Rule ${rule.isActive ? 'activated' : 'deactivated'}: ${rule.name}`, {
      ruleId: id,
      isActive: rule.isActive,
    }, duration);

    return NextResponse.json({
      success: true,
      data: rule,
      message: rule.isActive ? 'Regla activada' : 'Regla desactivada',
    });
  } catch (error: any) {
    logger.error('api', `Error toggling rule: ${error.message}`, {
      ruleId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
