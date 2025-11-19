import { NextRequest, NextResponse } from 'next/server';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/campaigns
 * Get all campaigns
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

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

    return NextResponse.json({
      success: true,
      data: campaigns,
    });
  } catch (error: any) {
    console.error('Error fetching campaigns:', error);
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
  console.log('🚀 POST /api/campaigns - Starting campaign creation');

  try {
    // Parse request body
    let body;
    try {
      body = await request.json();
      console.log('📦 Received campaign data:', {
        name: body.name,
        campaignType: body.campaignType,
        offerId: body.offerId,
        country: body.country,
        platformsCount: body.platforms?.length,
      });
    } catch (parseError: any) {
      console.error('❌ Failed to parse request body:', parseError);
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid JSON in request body',
          details: parseError.message,
        },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = ['name', 'campaignType', 'provider', 'addAccountId', 'tonicAccountId', 'offerId', 'country', 'language', 'platforms'];
    const missingFields = requiredFields.filter(field => !body[field]);

    if (missingFields.length > 0) {
      console.error('❌ Missing required fields:', missingFields);
      return NextResponse.json(
        {
          success: false,
          error: `Missing required fields: ${missingFields.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Validate platforms array
    if (!Array.isArray(body.platforms) || body.platforms.length === 0) {
      console.error('❌ Invalid platforms data');
      return NextResponse.json(
        {
          success: false,
          error: 'At least one platform is required',
        },
        { status: 400 }
      );
    }

    console.log('✅ Validation passed, launching campaign orchestrator...');

    // Launch campaign
    const result = await campaignOrchestrator.launchCampaign({
      name: body.name,
      campaignType: body.campaignType,
      provider: body.provider,
      addAccountId: body.addAccountId,
      tonicAccountId: body.tonicAccountId,
      offerId: body.offerId,
      country: body.country,
      language: body.language,
      copyMaster: body.copyMaster,
      communicationAngle: body.communicationAngle,
      keywords: body.keywords,
      platforms: body.platforms.map((p: any) => ({
        platform: p.platform,
        performanceGoal: p.performanceGoal,
        budget: parseFloat(p.budget),
        startDate: new Date(p.startDate),
        generateWithAI: p.generateWithAI !== false,
        fanPage: p.fanPage,
        pixel: p.pixel,
        instagramPage: p.instagramPage,
        tiktokPage: p.tiktokPage,
      })),
    });

    console.log('✅ Campaign created successfully:', result.campaignId);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('❌ Campaign creation failed with error:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error occurred',
        errorType: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
