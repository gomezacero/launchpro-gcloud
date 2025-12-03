import { NextRequest, NextResponse } from 'next/server';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/campaigns
 * Get all campaigns
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    logger.info('api', `GET /api/campaigns${status ? ` - status: ${status}` : ''}`);

    const campaigns = await prisma.campaign.findMany({
      where: status ? { status: status as any } : undefined,
      include: {
        offer: true,
        platforms: true,
        media: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${campaigns.length} campaigns`, {
      count: campaigns.length,
      status: status || 'all'
    }, duration);

    return NextResponse.json({
      success: true,
      data: campaigns,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching campaigns: ${error.message}`, {
      stack: error.stack,
      error: error.message,
      duration,
    });

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
 * POST /api/campaigns
 * Create a new campaign (ASYNC mode - returns immediately)
 *
 * The campaign is created in DB and article request is submitted to Tonic.
 * Cron jobs handle the rest of the processing (article approval, tracking link, launch).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('api', 'POST /api/campaigns - Creating new campaign (async mode)', {
      name: body.name,
      campaignType: body.campaignType,
      country: body.country,
      platformCount: body.platforms?.length || 0,
    });

    // Validate required fields
    const requiredFields = ['name', 'campaignType', 'tonicAccountId', 'offerId', 'country', 'language', 'platforms'];
    for (const field of requiredFields) {
      if (!body[field]) {
        logger.warn('api', `Missing required field: ${field}`, { field });
        return NextResponse.json(
          {
            success: false,
            error: `Missing required field: ${field}`,
          },
          { status: 400 }
        );
      }
    }

    // Create campaign quickly (async mode - returns immediately)
    const result = await campaignOrchestrator.createCampaignQuick({
      name: body.name,
      campaignType: body.campaignType,
      tonicAccountId: body.tonicAccountId,
      offerId: body.offerId,
      country: body.country,
      language: body.language,
      copyMaster: body.copyMaster,
      communicationAngle: body.communicationAngle,
      keywords: body.keywords,
      contentGenerationPhrases: body.contentGenerationPhrases,
      platforms: body.platforms.map((p: any) => {
        // Parse startDateTime as UTC (the UI says "Time is in UTC")
        // datetime-local gives format YYYY-MM-DDTHH:mm without timezone
        // Adding 'Z' ensures it's interpreted as UTC, not local time
        const startDateStr = p.startDateTime || p.startDate;
        let startDate: Date;
        if (typeof startDateStr === 'string' && !startDateStr.includes('Z') && !startDateStr.includes('+')) {
          // String without timezone indicator - treat as UTC
          startDate = new Date(startDateStr + ':00Z'); // Add seconds and Z for UTC
        } else {
          startDate = new Date(startDateStr);
        }

        return {
          platform: p.platform,
          accountId: p.accountId,
          performanceGoal: p.performanceGoal,
          budget: parseFloat(p.budget),
          startDate,
          generateWithAI: p.generateWithAI !== false,
          specialAdCategories: p.specialAdCategories,
          metaPageId: p.metaPageId,
          tiktokIdentityId: p.tiktokIdentityId,
          tiktokIdentityType: p.tiktokIdentityType,
          manualAdCopy: p.platform === 'META' ? {
            adTitle: p.manualAdTitle,
            description: p.manualDescription,
            primaryText: p.manualPrimaryText,
          } : undefined,
          manualTiktokAdText: p.manualTiktokAdText,
        };
      }),
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Campaign created (async): ${body.name}`, {
      campaignId: result.campaignId,
      status: result.status,
      articleRequestId: result.articleRequestId,
    }, duration);

    // Return immediately with pending status
    return NextResponse.json({
      success: true,
      data: {
        campaignId: result.campaignId,
        status: result.status,
        articleRequestId: result.articleRequestId,
        message: result.status === 'PENDING_ARTICLE'
          ? 'Campaña creada. Esperando aprobación de artículo en Tonic...'
          : 'Campaña creada. Procesando en background...',
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error creating campaign: ${error.message}`, {
      stack: error.stack,
      error: error.message,
      tonicData: error.tonicData,
      duration,
    });

    // Extract more details from the error if available
    let details = error.message;
    if (error.response?.data) {
      details = typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data, null, 2);
    }
    if (error.cause) {
      details += `\n\nCause: ${error.cause}`;
    }

    // Include Tonic data field (contains clearest error message)
    const tonicData = error.tonicData || null;

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        details: details,
        tonicData: tonicData, // The clear error message from Tonic API
        technicalDetails: process.env.NODE_ENV === 'development' ? error.stack : details,
      },
      { status: 500 }
    );
  }
}
