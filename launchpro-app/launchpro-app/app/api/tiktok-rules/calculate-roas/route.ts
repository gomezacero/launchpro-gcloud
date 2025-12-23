import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tiktokService } from '@/services/tiktok.service';
import { tonicService, TonicCredentials } from '@/services/tonic.service';

/**
 * POST /api/tiktok-rules/calculate-roas
 * Debug endpoint to calculate ROAS using Tonic revenue and TikTok cost
 *
 * ROAS Formula: (Gross Revenue from Tonic / Cost from TikTok) * 100
 */

interface CalculateRoasRequest {
  tiktokAccountId: string;
  tonicAccountId: string;
  dateRange: 'today' | 'yesterday' | 'last7days' | 'last30days';
  campaignIds?: string[]; // Array of TikTok campaign IDs (optional, if empty calculates for all)
}

interface CampaignRoasResult {
  tiktokCampaignId: string;
  tiktokCampaignName: string;
  tonicCampaignId: string | null;
  grossRevenue: number;
  cost: number;
  calculatedRoas: number;
  error?: string;
}

/**
 * Extract Tonic campaign ID from TikTok campaign name
 * Format: "4193514_TestPromptCampaign" -> "4193514"
 */
function extractTonicIdFromCampaignName(name: string): string | null {
  const match = name.match(/^(\d+)_/);
  return match ? match[1] : null;
}

/**
 * Convert date range to Tonic from/to dates
 */
function getTonicDateRange(dateRange: string): { from: string; to: string } {
  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  // Yesterday - EPC Final has data up to yesterday
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = formatDate(yesterday);

  console.log(`[TIKTOK-ROAS-DATE] dateRange=${dateRange}, now=${formatDate(now)}, yesterday=${yesterdayStr}`);

  switch (dateRange) {
    case 'today': {
      return { from: yesterdayStr, to: yesterdayStr };
    }
    case 'yesterday': {
      return { from: yesterdayStr, to: yesterdayStr };
    }
    case 'last7days': {
      const from = new Date(yesterday);
      from.setDate(from.getDate() - 6);
      return { from: formatDate(from), to: yesterdayStr };
    }
    case 'last30days': {
      const from = new Date(yesterday);
      from.setDate(from.getDate() - 29);
      return { from: formatDate(from), to: yesterdayStr };
    }
    default: {
      return { from: yesterdayStr, to: yesterdayStr };
    }
  }
}

/**
 * Convert date range to TikTok API format (start_date, end_date)
 */
function getTikTokDateRange(dateRange: string): { startDate: string; endDate: string } {
  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  switch (dateRange) {
    case 'today':
      return { startDate: formatDate(now), endDate: formatDate(now) };
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return { startDate: formatDate(yesterday), endDate: formatDate(yesterday) };
    }
    case 'last7days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { startDate: formatDate(start), endDate: formatDate(now) };
    }
    case 'last30days': {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      return { startDate: formatDate(start), endDate: formatDate(now) };
    }
    default:
      return { startDate: formatDate(now), endDate: formatDate(now) };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CalculateRoasRequest = await request.json();
    const { tiktokAccountId, tonicAccountId, dateRange, campaignIds } = body;

    const targetCampaignIds = campaignIds?.length ? campaignIds : [];

    // Validate required fields
    if (!tiktokAccountId || !tonicAccountId || !dateRange) {
      return NextResponse.json(
        { error: 'Missing required fields: tiktokAccountId, tonicAccountId, dateRange' },
        { status: 400 }
      );
    }

    // Get TikTok account
    const tiktokAccount = await prisma.account.findUnique({
      where: { id: tiktokAccountId },
    });

    if (!tiktokAccount || tiktokAccount.accountType !== 'TIKTOK') {
      return NextResponse.json(
        { error: 'TikTok account not found or invalid type' },
        { status: 404 }
      );
    }

    // Get Tonic account
    const tonicAccount = await prisma.account.findUnique({
      where: { id: tonicAccountId },
    });

    if (!tonicAccount || tonicAccount.accountType !== 'TONIC') {
      return NextResponse.json(
        { error: 'Tonic account not found or invalid type' },
        { status: 404 }
      );
    }

    if (!tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      return NextResponse.json(
        { error: 'Tonic account missing credentials' },
        { status: 400 }
      );
    }

    const tonicCredentials: TonicCredentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    // Get access token (account-specific or global fallback)
    let accessToken = tiktokAccount.tiktokAccessToken;
    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });
      accessToken = globalSettings?.tiktokAccessToken ?? null;
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No TikTok access token available' },
        { status: 400 }
      );
    }

    if (!tiktokAccount.tiktokAdvertiserId) {
      return NextResponse.json(
        { error: 'TikTok account missing advertiser ID' },
        { status: 400 }
      );
    }

    const advertiserId = tiktokAccount.tiktokAdvertiserId;

    // Get date ranges
    const { from: tonicFrom, to: tonicTo } = getTonicDateRange(dateRange);
    const { startDate: tiktokStart, endDate: tiktokEnd } = getTikTokDateRange(dateRange);

    // Get Tonic revenue using EPC Final endpoint
    console.log(`[TIKTOK-ROAS] Fetching Tonic revenue for date range: ${tonicFrom} to ${tonicTo}`);
    let tonicRevenueMap: Map<string, number>;
    try {
      tonicRevenueMap = await tonicService.getCampaignGrossRevenueRange(tonicCredentials, tonicFrom, tonicTo);
      console.log(`[TIKTOK-ROAS] Tonic revenue fetched: ${tonicRevenueMap.size} campaigns`);
    } catch (error: any) {
      console.error(`[TIKTOK-ROAS] Failed to fetch Tonic revenue:`, error.message);
      return NextResponse.json(
        { error: `Failed to fetch Tonic revenue: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[TIKTOK-ROAS] Tonic revenue map:`, Object.fromEntries(tonicRevenueMap));

    // Get TikTok campaigns
    let tiktokCampaigns: Array<{ id: string; name: string; status: string }>;

    // Get all active campaigns first
    const allCampaigns = await tiktokService.getActiveCampaigns(advertiserId, accessToken);

    // Filter by specific campaign IDs if provided
    if (targetCampaignIds.length > 0) {
      tiktokCampaigns = allCampaigns.filter(c => targetCampaignIds.includes(c.id));
      console.log(`[TIKTOK-ROAS] Filtered to ${tiktokCampaigns.length} campaigns from ${targetCampaignIds.length} specified IDs`);
    } else {
      tiktokCampaigns = allCampaigns;
    }

    console.log(`[TIKTOK-ROAS] TikTok campaigns to evaluate: ${tiktokCampaigns.length}`);

    // Calculate ROAS for each campaign
    const results: CampaignRoasResult[] = [];
    const errors: string[] = [];
    let totalGrossRevenue = 0;
    let totalCost = 0;

    for (const campaign of tiktokCampaigns) {
      const tonicId = extractTonicIdFromCampaignName(campaign.name);
      let error: string | undefined;

      // Get TikTok insights (spend)
      const tiktokInsights = await tiktokService.getEntityInsights(
        campaign.id,
        'campaign',
        dateRange,
        accessToken,
        advertiserId
      );

      const cost = tiktokInsights?.spend || 0;

      // Get Tonic revenue
      let grossRevenue = 0;
      if (tonicId) {
        grossRevenue = tonicRevenueMap.get(tonicId) || 0;
        if (grossRevenue === 0 && cost > 0) {
          error = `No Tonic revenue data found for campaign ID ${tonicId}`;
          errors.push(`Campaign "${campaign.name}": ${error}`);
        }
      } else {
        error = `Could not extract Tonic ID from campaign name "${campaign.name}"`;
        errors.push(error);
      }

      // Calculate ROAS: (Gross Revenue / Cost) * 100
      const calculatedRoas = cost > 0 ? (grossRevenue / cost) * 100 : 0;

      totalGrossRevenue += grossRevenue;
      totalCost += cost;

      results.push({
        tiktokCampaignId: campaign.id,
        tiktokCampaignName: campaign.name,
        tonicCampaignId: tonicId,
        grossRevenue,
        cost,
        calculatedRoas,
        error,
      });
    }

    // Calculate overall ROAS
    const overallRoas = totalCost > 0 ? (totalGrossRevenue / totalCost) * 100 : 0;

    return NextResponse.json({
      success: true,
      platform: 'TikTok',
      dateRange,
      tonicDate: `${tonicFrom} to ${tonicTo}`,
      tiktokDate: `${tiktokStart} to ${tiktokEnd}`,
      campaigns: results,
      totals: {
        totalGrossRevenue,
        totalCost,
        overallRoas,
        campaignsEvaluated: results.length,
        campaignsWithErrors: errors.length,
      },
      errors,
    });
  } catch (error: any) {
    console.error('[TIKTOK-ROAS] Calculate ROAS error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate TikTok ROAS' },
      { status: 500 }
    );
  }
}
