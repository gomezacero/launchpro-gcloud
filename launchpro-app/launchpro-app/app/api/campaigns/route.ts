import { NextRequest, NextResponse } from 'next/server';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { requireAuth, isSuperAdmin } from '@/lib/auth-utils';
import { isCountryAllowed, isWorldwide } from '@/lib/allowed-countries';
import { CampaignStatus } from '@prisma/client';

/**
 * GET /api/campaigns
 * Get campaigns - filtered by ownership for MANAGER role
 * SUPERADMIN sees all campaigns, MANAGER sees only their own
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const managerId = searchParams.get('managerId'); // For SUPERADMIN filtering

    logger.info('api', `GET /api/campaigns - User: ${user!.email}, Role: ${user!.role}${status ? `, status: ${status}` : ''}`);

    // Build where clause
    const where: any = {};

    if (status) {
      where.status = status;
    }

    // MANAGER can only see their own campaigns
    // SUPERADMIN can see all, or filter by managerId
    if (!isSuperAdmin(user)) {
      where.createdById = user!.id;
    } else if (managerId) {
      where.createdById = managerId;
    }

    const campaigns = await prisma.campaign.findMany({
      where,
      include: {
        offer: true,
        platforms: true,
        media: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${campaigns.length} campaigns`, {
      count: campaigns.length,
      status: status || 'all',
      role: user!.role,
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
    // Require authentication
    const { user, error } = await requireAuth();
    if (error) return error;

    const body = await request.json();

    logger.info('api', `POST /api/campaigns - Creating new campaign by ${user!.email}`, {
      name: body.name,
      campaignType: body.campaignType,
      country: body.country,
      platformCount: body.platforms?.length || 0,
      createdBy: user!.name,
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

    // Validate country is allowed (GEO restrictions as of Jan 2026)
    const countryCode = body.country;
    if (!isWorldwide(countryCode) && !isCountryAllowed(countryCode)) {
      logger.warn('api', `Blocked GEO: ${countryCode} is not in the allowed countries list`, {
        country: countryCode,
        campaignName: body.name,
      });
      return NextResponse.json(
        {
          success: false,
          error: `Country "${countryCode}" is not available for campaign launches. Only 87 approved countries are allowed based on Tonic GEO restrictions.`,
        },
        { status: 400 }
      );
    }

    // Create campaign in QUEUED status (queue system - returns immediately)
    // The process-queue cron will handle starting the campaign when it's its turn
    const result = await campaignOrchestrator.createCampaignQueued({
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
      // RSOC article mode: 'new' for new article, 'existing' for reusing headline
      rsocMode: body.rsocMode || 'new',
      selectedHeadlineId: body.selectedHeadlineId || null,
      createdById: user!.id, // Set owner to current user
      // DesignFlow configuration (used when article is approved by Tonic cron job)
      needsDesignFlow: body.needsDesignFlow ?? false, // Persist to database for cron job decision
      designFlowRequester: body.designFlowRequester || 'Harry',
      designFlowNotes: body.designFlowNotes,
      platforms: body.platforms.map((p: any) => {
        // Keep startDateTime as string - we'll convert it later with proper timezone handling
        // The user configures in their local timezone, we need to preserve this
        const startDateTimeStr = p.startDateTime || p.startDate;

        // For DB storage, we still need a Date object, but we'll also store the raw string
        // Parse as if it's UTC-5 (Colombia timezone) - add 5 hours to get UTC
        // This is a workaround until we have proper timezone handling from frontend
        let startDate: Date;
        if (typeof startDateTimeStr === 'string' && !startDateTimeStr.includes('Z') && !startDateTimeStr.includes('+')) {
          // User entered local time (e.g., "2025-12-04T02:00")
          // Assume UTC-5 (Colombia) - add 5 hours to convert to UTC
          const localDate = new Date(startDateTimeStr);
          startDate = new Date(localDate.getTime() + (5 * 60 * 60 * 1000)); // Add 5 hours for UTC-5
        } else {
          startDate = new Date(startDateTimeStr);
        }

        return {
          platform: p.platform,
          accountId: p.accountId,
          performanceGoal: p.performanceGoal,
          budget: parseFloat(p.budget),
          startDate,
          generateWithAI: p.generateWithAI !== false,
          // AI media generation settings
          aiMediaType: p.aiMediaType || (p.platform === 'TIKTOK' ? 'VIDEO' : 'IMAGE'),
          aiMediaCount: parseInt(String(p.aiMediaCount)) || 1,
          adsPerAdSet: parseInt(String(p.adsPerAdSet)) || 1, // For ABO: ads per ad set
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
    logger.success('api', `Campaign queued: ${body.name}`, {
      campaignId: result.campaignId,
      status: result.status,
      queuePosition: result.queuePosition,
    }, duration);

    // Return immediately with queued status
    return NextResponse.json({
      success: true,
      data: {
        campaignId: result.campaignId,
        status: result.status,
        queuePosition: result.queuePosition,
        message: result.message,
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
