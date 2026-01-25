import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/diagnostic/audit-logs?campaignId=xxx
 *
 * Returns all audit logs for a campaign, showing every status change
 * with timestamp and caller information.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');

    const logs = await prisma.campaignAuditLog.findMany({
      where: campaignId ? { campaignId } : {},
      orderBy: { timestamp: 'desc' },
      take: 100,
      include: {
        campaign: {
          select: { name: true, status: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: logs.length,
      logs: logs.map(log => ({
        id: log.id,
        campaignId: log.campaignId,
        campaignName: log.campaign.name,
        currentStatus: log.campaign.status,
        newStatus: log.newStatus,
        action: log.action,
        caller: log.caller,
        timestamp: log.timestamp,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
