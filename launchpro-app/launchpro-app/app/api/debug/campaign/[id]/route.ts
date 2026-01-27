import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * DEBUG endpoint to check campaign platform data and state
 * GET /api/debug/campaign/[id]
 *
 * v2.9.4: Enhanced with state flow debugging for troubleshooting
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        platforms: {
          select: {
            id: true,
            platform: true,
            adsPerAdSet: true,
            aiMediaCount: true,
            aiMediaType: true,
            budget: true,
            generateWithAI: true,
            metaCampaignId: true,
            tiktokCampaignId: true,
            status: true,
          },
        },
        media: {
          select: {
            id: true,
            type: true,
            fileName: true,
          },
        },
        offer: {
          select: {
            id: true,
            name: true,
            tonicId: true,
            vertical: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get recent audit logs for this campaign
    const recentLogs = await prisma.campaignAuditLog.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        event: true,
        source: true,
        previousStatus: true,
        newStatus: true,
        message: true,
        isError: true,
        createdAt: true,
      },
    });

    // Calculate state flow health
    const stateFlowAnalysis = {
      hasTonicCampaignId: !!campaign.tonicCampaignId,
      hasTrackingLink: !!campaign.tonicTrackingLink && !campaign.tonicTrackingLink.includes('pending'),
      hasTrackingLinkPollingStartedAt: !!campaign.trackingLinkPollingStartedAt,
      hasCopyMaster: !!campaign.copyMaster,
      hasKeywords: campaign.keywords && campaign.keywords.length > 0,
      hasPreGeneratedAdCopy: !!campaign.preGeneratedAdCopy,
      // Flow validation
      passedThroughAwaitingTracking: !!campaign.trackingLinkPollingStartedAt,
      readyForProcessCampaigns: campaign.status === 'ARTICLE_APPROVED' &&
        !!campaign.tonicTrackingLink &&
        !!campaign.trackingLinkPollingStartedAt,
    };

    return NextResponse.json({
      campaignId: campaign.id,
      name: campaign.name,
      campaignType: campaign.campaignType,
      status: campaign.status,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      // Tonic data
      tonicArticleRequestId: campaign.tonicArticleRequestId,
      tonicArticleId: campaign.tonicArticleId,
      tonicCampaignId: campaign.tonicCampaignId,
      tonicTrackingLink: campaign.tonicTrackingLink,
      // State flow tracking
      trackingLinkPollingStartedAt: campaign.trackingLinkPollingStartedAt,
      trackingLinkPollingAttempts: campaign.trackingLinkPollingAttempts,
      // AI content
      hasCopyMaster: !!campaign.copyMaster,
      keywordsCount: campaign.keywords?.length || 0,
      hasPreGeneratedAdCopy: !!campaign.preGeneratedAdCopy,
      // Error info
      errorDetails: campaign.errorDetails,
      // Related data
      offer: campaign.offer,
      platforms: campaign.platforms,
      mediaCount: campaign.media.length,
      media: campaign.media,
      // Analysis
      stateFlowAnalysis,
      // Recent logs
      recentAuditLogs: recentLogs,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
