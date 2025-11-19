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
 * Create and launch a new campaign
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('api', 'POST /api/campaigns - Creating new campaign', {
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

    // Determine if we need to skip platform launch (for manual media upload)
    const hasManualUpload = body.platforms.some((p: any) => p.generateWithAI === false);

    if (hasManualUpload) {
      logger.info('api', '📤 Manual media upload detected - will skip platform launch', {
        platforms: body.platforms.map((p: any) => ({ platform: p.platform, generateWithAI: p.generateWithAI })),
      });
    } else {
      logger.info('api', 'Launching campaign with orchestrator...', {
        platforms: body.platforms.map((p: any) => p.platform),
      });
    }

    // Launch campaign (with optional skipPlatformLaunch)
    const result = await campaignOrchestrator.launchCampaign({
      name: body.name,
      campaignType: body.campaignType,
      tonicAccountId: body.tonicAccountId,
      offerId: body.offerId,
      country: body.country,
      language: body.language,
      copyMaster: body.copyMaster,
      communicationAngle: body.communicationAngle,
      keywords: body.keywords,
      platforms: body.platforms.map((p: any) => ({
        platform: p.platform,
        accountId: p.accountId,
        performanceGoal: p.performanceGoal,
        budget: parseFloat(p.budget),
        startDate: new Date(p.startDate),
        generateWithAI: p.generateWithAI !== false,
      })),
      skipPlatformLaunch: hasManualUpload, // Skip if manual upload is needed
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Campaign created successfully: ${body.name}`, {
      campaignId: result.campaignId,
      platforms: body.platforms.map((p: any) => p.platform),
    }, duration);

    return NextResponse.json({
      success: true,
      data: {
        campaignId: result.campaignId,
        tonicCampaignId: result.tonicCampaignId,
        tonicTrackingLink: result.tonicTrackingLink,
        success: result.success,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error creating campaign: ${error.message}`, {
      stack: error.stack,
      error: error.message,
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
