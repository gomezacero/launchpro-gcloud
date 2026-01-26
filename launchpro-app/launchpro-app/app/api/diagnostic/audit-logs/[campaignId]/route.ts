import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/diagnostic/audit-logs/[campaignId]
 *
 * Get all audit logs for a specific campaign.
 * This endpoint provides complete visibility into the campaign lifecycle.
 *
 * Query params:
 * - limit: Max number of logs (default: 100)
 * - errors: If 'true', only show error logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> }
) {
  try {
    const { campaignId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const errorsOnly = searchParams.get('errors') === 'true';

    // Get campaign basic info
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        tonicArticleRequestId: true,
        tonicCampaignId: true,
        tonicTrackingLink: true,
        errorDetails: true,
      },
    });

    if (!campaign) {
      return NextResponse.json({
        success: false,
        error: 'Campaign not found',
      }, { status: 404 });
    }

    // Get audit logs
    const where: any = { campaignId };
    if (errorsOnly) {
      where.isError = true;
    }

    const logs = await prisma.campaignAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Calculate timeline
    const timeline = logs.reverse().map((log, index) => ({
      index: index + 1,
      time: log.createdAt.toISOString(),
      event: log.event,
      source: log.source,
      status: log.newStatus || '-',
      message: log.message,
      isError: log.isError,
      errorCode: log.errorCode,
      durationMs: log.durationMs,
    }));

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        currentStatus: campaign.status,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        tonicArticleRequestId: campaign.tonicArticleRequestId,
        tonicCampaignId: campaign.tonicCampaignId,
        tonicTrackingLink: campaign.tonicTrackingLink,
        errorDetails: campaign.errorDetails,
      },
      totalLogs: logs.length,
      errorsCount: logs.filter(l => l.isError).length,
      timeline,
      logs: logs.map(log => ({
        id: log.id,
        event: log.event,
        source: log.source,
        previousStatus: log.previousStatus,
        newStatus: log.newStatus,
        message: log.message,
        details: log.details,
        isError: log.isError,
        errorCode: log.errorCode,
        errorStack: log.errorStack,
        durationMs: log.durationMs,
        createdAt: log.createdAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
