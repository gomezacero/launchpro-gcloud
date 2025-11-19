import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * GET /api/logs
 * Get system logs for debugging
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100;
    const category = searchParams.get('category') as any;
    const level = searchParams.get('level') as any;

    const logs = logger.getLogs({ limit, category, level });
    const stats = logger.getStats();

    return NextResponse.json({
      success: true,
      data: {
        logs,
        stats,
        count: logs.length,
      },
    });
  } catch (error: any) {
    console.error('[API] Error fetching logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/logs
 * Clear all logs
 */
export async function DELETE(request: NextRequest) {
  try {
    logger.clear();

    return NextResponse.json({
      success: true,
      message: 'Logs cleared successfully',
    });
  } catch (error: any) {
    console.error('[API] Error clearing logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
