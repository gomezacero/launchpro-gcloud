import { NextRequest, NextResponse } from 'next/server';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { logger } from '@/lib/logger';

/**
 * Launch an existing campaign to configured platforms
 * POST /api/campaigns/[id]/launch
 *
 * This endpoint is called AFTER:
 * 1. Campaign has been created (via POST /api/campaigns)
 * 2. Media files have been uploaded (via POST /api/campaigns/[id]/media)
 *
 * It will:
 * 1. Fetch the campaign from database
 * 2. Launch to each configured platform (Meta/TikTok)
 * 3. Upload media to platforms
 * 4. Create ads
 * 5. Update campaign status to ACTIVE or FAILED
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now();
  const { id: campaignId } = await params;

  try {
    logger.info('api', `POST /api/campaigns/${campaignId}/launch - Launching campaign to platforms`);

    // Launch campaign to platforms
    const result = await campaignOrchestrator.launchExistingCampaignToPlatforms(campaignId);

    const duration = Date.now() - startTime;
    logger.success('api', `Campaign launched successfully`, {
      campaignId,
      platforms: result.platforms.map(p => ({ platform: p.platform, success: p.success })),
    }, duration);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error launching campaign: ${error.message}`, {
      campaignId,
      error: error.message,
      stack: error.stack,
      duration,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
