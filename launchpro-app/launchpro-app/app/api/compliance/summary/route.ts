import { NextRequest, NextResponse } from 'next/server';
import { complianceService } from '@/services/compliance.service';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * GET /api/compliance/summary
 * Get compliance summary statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    logger.info('api', `GET /api/compliance/summary - User: ${user!.email}`);

    const summary = await complianceService.getComplianceSummary(user!.email);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching compliance summary: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
