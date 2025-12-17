import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { metaService } from '@/services/meta.service';
import { tonicService, TonicCredentials } from '@/services/tonic.service';

/**
 * POST /api/rules/calculate-roas
 * Debug endpoint to calculate ROAS using Tonic revenue and Meta cost
 *
 * ROAS Formula: (Gross Revenue from Tonic / Cost from Meta) * 100
 */

interface CalculateRoasRequest {
  metaAccountId: string;
  tonicAccountId: string;
  dateRange: 'today' | 'yesterday' | 'last7days' | 'last30days';
  campaignId?: string; // Meta campaign ID (optional, if null calculates for all)
}

interface CampaignRoasResult {
  metaCampaignId: string;
  metaCampaignName: string;
  tonicCampaignId: string | null;
  grossRevenue: number;
  cost: number;
  calculatedRoas: number;
  metaRoas: number;
  error?: string;
}

/**
 * Extract Tonic campaign ID from Meta campaign name
 * Format: "4193514_TestPromptCampaign" -> "4193514"
 */
function extractTonicIdFromCampaignName(name: string): string | null {
  const match = name.match(/^(\d+)_/);
  return match ? match[1] : null;
}

/**
 * Convert date range to actual date string (YYYY-MM-DD)
 */
function getDateFromRange(dateRange: string): string {
  const now = new Date();

  switch (dateRange) {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'yesterday':
      now.setDate(now.getDate() - 1);
      return now.toISOString().split('T')[0];
    case 'last7days':
      // For Tonic, we can only query one day at a time
      // Return today's date, but the frontend should aggregate multiple days
      return now.toISOString().split('T')[0];
    case 'last30days':
      return now.toISOString().split('T')[0];
    default:
      return now.toISOString().split('T')[0];
  }
}

/**
 * Convert date range to Meta API date preset
 */
function getMetaDatePreset(dateRange: string): string {
  switch (dateRange) {
    case 'today':
      return 'today';
    case 'yesterday':
      return 'yesterday';
    case 'last7days':
      return 'last_7d';
    case 'last30days':
      return 'last_30d';
    default:
      return 'today';
  }
}

/**
 * Convert date range to Tonic from/to dates for EPC Final endpoint
 */
function getTonicDateRange(dateRange: string): { from: string; to: string } {
  const now = new Date();
  const formatDate = (d: Date) => d.toISOString().split('T')[0];

  switch (dateRange) {
    case 'today': {
      const today = formatDate(now);
      return { from: today, to: today };
    }
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = formatDate(yesterday);
      return { from: yesterdayStr, to: yesterdayStr };
    }
    case 'last7days': {
      const to = formatDate(now);
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: formatDate(from), to };
    }
    case 'last30days': {
      const to = formatDate(now);
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: formatDate(from), to };
    }
    default: {
      const today = formatDate(now);
      return { from: today, to: today };
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CalculateRoasRequest = await request.json();
    const { metaAccountId, tonicAccountId, dateRange, campaignId } = body;

    // Validate required fields
    if (!metaAccountId || !tonicAccountId || !dateRange) {
      return NextResponse.json(
        { error: 'Missing required fields: metaAccountId, tonicAccountId, dateRange' },
        { status: 400 }
      );
    }

    // Get Meta account
    const metaAccount = await prisma.account.findUnique({
      where: { id: metaAccountId },
    });

    if (!metaAccount || metaAccount.accountType !== 'META') {
      return NextResponse.json(
        { error: 'Meta account not found or invalid type' },
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
    let accessToken = metaAccount.metaAccessToken;
    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });
      accessToken = globalSettings?.metaAccessToken ?? process.env.META_ACCESS_TOKEN ?? null;
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'No Meta access token available' },
        { status: 400 }
      );
    }

    if (!metaAccount.metaAdAccountId) {
      return NextResponse.json(
        { error: 'Meta account missing ad account ID' },
        { status: 400 }
      );
    }

    // Get date range for Tonic API (EPC Final uses from/to dates)
    const metaDatePreset = getMetaDatePreset(dateRange);
    const { from: tonicFrom, to: tonicTo } = getTonicDateRange(dateRange);

    // Get Tonic revenue using EPC Final endpoint (uses revenueUsd for accurate values)
    console.log(`[ROAS] Fetching Tonic revenue (EPC Final) for date range: ${tonicFrom} to ${tonicTo}`);
    let tonicRevenueMap: Map<string, number>;
    try {
      tonicRevenueMap = await tonicService.getCampaignGrossRevenueRange(tonicCredentials, tonicFrom, tonicTo);
      console.log(`[ROAS] Tonic revenue fetched: ${tonicRevenueMap.size} campaigns`);
    } catch (error: any) {
      console.error(`[ROAS] Failed to fetch Tonic revenue:`, error.message);
      return NextResponse.json(
        { error: `Failed to fetch Tonic revenue: ${error.message}` },
        { status: 500 }
      );
    }

    console.log(`[ROAS] Tonic revenue map:`, Object.fromEntries(tonicRevenueMap));

    // Get Meta campaigns
    let metaCampaigns: Array<{ id: string; name: string; status: string }>;
    if (campaignId) {
      // Get specific campaign
      try {
        const campaign = await metaService.getCampaign(campaignId, accessToken);
        metaCampaigns = campaign ? [{ id: campaign.id, name: campaign.name, status: campaign.status }] : [];
      } catch {
        metaCampaigns = [];
      }
    } else {
      // Get all active campaigns
      metaCampaigns = await metaService.getActiveCampaigns(metaAccount.metaAdAccountId, accessToken);
    }

    console.log(`[ROAS] Meta campaigns found: ${metaCampaigns.length}`);

    // Calculate ROAS for each campaign
    const results: CampaignRoasResult[] = [];
    const errors: string[] = [];
    let totalGrossRevenue = 0;
    let totalCost = 0;

    for (const campaign of metaCampaigns) {
      const tonicId = extractTonicIdFromCampaignName(campaign.name);
      let error: string | undefined;

      // Get Meta insights (spend)
      const metaInsights = await metaService.getEntityInsights(
        campaign.id,
        'campaign',
        metaDatePreset,
        accessToken
      );

      const cost = metaInsights?.spend || 0;
      const metaRoas = metaInsights?.roas || 0;

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
        metaCampaignId: campaign.id,
        metaCampaignName: campaign.name,
        tonicCampaignId: tonicId,
        grossRevenue,
        cost,
        calculatedRoas,
        metaRoas,
        error,
      });
    }

    // Calculate overall ROAS
    const overallRoas = totalCost > 0 ? (totalGrossRevenue / totalCost) * 100 : 0;

    return NextResponse.json({
      success: true,
      dateRange,
      tonicDate: `${tonicFrom} to ${tonicTo}`,
      metaDatePreset,
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
    console.error('[ROAS] Calculate ROAS error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate ROAS' },
      { status: 500 }
    );
  }
}
