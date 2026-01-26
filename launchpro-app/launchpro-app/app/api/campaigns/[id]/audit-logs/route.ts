import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, isSuperAdmin } from '@/lib/auth-utils';

/**
 * GET /api/campaigns/[id]/audit-logs
 *
 * Retrieve all audit logs for a campaign.
 * This provides visibility into the complete campaign lifecycle,
 * especially useful when Vercel logs are limited.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;

  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    // Verify campaign exists and user has access
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        name: true,
        status: true,
        createdById: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Non-admins can only see their own campaigns
    if (!isSuperAdmin(user) && campaign.createdById !== user!.id) {
      return NextResponse.json(
        { success: false, error: 'Access denied' },
        { status: 403 }
      );
    }

    // Fetch audit logs
    const auditLogs = await prisma.campaignAuditLog.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });

    // Format for easy reading
    const formattedLogs = auditLogs.map(log => ({
      timestamp: log.createdAt.toISOString(),
      event: log.event,
      source: log.source,
      message: log.message,
      previousStatus: log.previousStatus,
      newStatus: log.newStatus,
      isError: log.isError,
      errorCode: log.errorCode,
      durationMs: log.durationMs,
      details: log.details,
    }));

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
      },
      logsCount: auditLogs.length,
      logs: formattedLogs,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
