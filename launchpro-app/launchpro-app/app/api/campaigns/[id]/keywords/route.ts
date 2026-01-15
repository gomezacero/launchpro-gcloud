import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, canAccessCampaign } from '@/lib/auth-utils';
import { tonicService } from '@/services/tonic.service';

/**
 * GET /api/campaigns/[id]/keywords
 * Get current keywords from Tonic for a campaign
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;

    // Get campaign with its Tonic account
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (!canAccessCampaign(user!, campaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Need Tonic campaign ID
    if (!campaign.tonicCampaignId) {
      return NextResponse.json(
        { success: false, error: 'Campaign has no Tonic ID - cannot fetch keywords' },
        { status: 400 }
      );
    }

    // Get Tonic account credentials
    const tonicPlatform = campaign.platforms.find(p => p.tonicAccount);
    if (!tonicPlatform?.tonicAccount) {
      return NextResponse.json(
        { success: false, error: 'No Tonic account linked to this campaign' },
        { status: 400 }
      );
    }

    const tonicAccount = tonicPlatform.tonicAccount;
    if (!tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Tonic account missing credentials' },
        { status: 400 }
      );
    }

    const credentials = {
      consumerKey: tonicAccount.tonicConsumerKey,
      consumerSecret: tonicAccount.tonicConsumerSecret,
    };

    // Get keywords from Tonic
    const tonicKeywords = await tonicService.getKeywords(
      credentials,
      parseInt(campaign.tonicCampaignId)
    );

    return NextResponse.json({
      success: true,
      data: {
        keywords: tonicKeywords.keywords || [],
        localKeywords: campaign.keywords || [],
      },
    });
  } catch (error: any) {
    console.error('[API] Error fetching keywords:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch keywords' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/campaigns/[id]/keywords
 * Update keywords in Tonic for a campaign
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const { keywords } = body;

    // Validate keywords
    if (!keywords || !Array.isArray(keywords)) {
      return NextResponse.json(
        { success: false, error: 'Keywords must be an array' },
        { status: 400 }
      );
    }

    if (keywords.length < 3 || keywords.length > 10) {
      return NextResponse.json(
        { success: false, error: 'Keywords must be between 3 and 10 items' },
        { status: 400 }
      );
    }

    // Get campaign with its Tonic account
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
          },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check ownership
    if (!canAccessCampaign(user!, campaign.createdById)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Need Tonic campaign ID
    if (!campaign.tonicCampaignId) {
      return NextResponse.json(
        { success: false, error: 'Campaign has no Tonic ID - cannot update keywords' },
        { status: 400 }
      );
    }

    // Get Tonic account credentials
    const tonicPlatform = campaign.platforms.find(p => p.tonicAccount);
    if (!tonicPlatform?.tonicAccount) {
      return NextResponse.json(
        { success: false, error: 'No Tonic account linked to this campaign' },
        { status: 400 }
      );
    }

    const tonicAccount = tonicPlatform.tonicAccount;
    if (!tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      return NextResponse.json(
        { success: false, error: 'Tonic account missing credentials' },
        { status: 400 }
      );
    }

    const credentials = {
      consumerKey: tonicAccount.tonicConsumerKey,
      consumerSecret: tonicAccount.tonicConsumerSecret,
    };

    // Update keywords in Tonic
    console.log(`[API] Updating keywords for campaign ${campaign.tonicCampaignId}:`, keywords);

    await tonicService.setKeywords(credentials, {
      campaign_id: parseInt(campaign.tonicCampaignId),
      keywords: keywords,
      keyword_amount: keywords.length,
    });

    // Also update local database
    await prisma.campaign.update({
      where: { id },
      data: { keywords },
    });

    console.log(`[API] Keywords updated successfully for campaign ${id}`);

    return NextResponse.json({
      success: true,
      message: 'Keywords updated successfully',
      data: { keywords },
    });
  } catch (error: any) {
    console.error('[API] Error updating keywords:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update keywords' },
      { status: 500 }
    );
  }
}
