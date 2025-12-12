import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tonicService, TonicCredentials } from '@/services/tonic.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId, endpoint, params } = body;

    if (!accountId || !endpoint) {
      return NextResponse.json({ success: false, error: 'accountId y endpoint son requeridos' }, { status: 400 });
    }

    // Get Tonic account credentials
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return NextResponse.json({ success: false, error: 'Cuenta no encontrada' }, { status: 404 });
    }

    if (!account.tonicConsumerKey || !account.tonicConsumerSecret) {
      return NextResponse.json({ success: false, error: 'Cuenta sin credenciales Tonic configuradas' }, { status: 400 });
    }

    const credentials: TonicCredentials = {
      consumer_key: account.tonicConsumerKey,
      consumer_secret: account.tonicConsumerSecret,
    };

    let result: any;
    const startTime = Date.now();

    switch (endpoint) {
      case 'stats_by_country':
        // Single date endpoint
        if (!params?.date) {
          return NextResponse.json({ success: false, error: 'date es requerido para stats_by_country' }, { status: 400 });
        }
        result = await tonicService.getStatsByCountry(credentials, params.date, params.hour);
        break;

      case 'stats_by_country_range':
        // Multiple calls for date range (aggregated)
        if (!params?.from || !params?.to) {
          return NextResponse.json({ success: false, error: 'from y to son requeridos para stats_by_country_range' }, { status: 400 });
        }
        const fromDate = new Date(params.from);
        const toDate = new Date(params.to);
        const allStats: any[] = [];
        const datesCalled: string[] = [];

        // Iterate through each day
        let currentDate = new Date(fromDate);
        while (currentDate <= toDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          datesCalled.push(dateStr);
          try {
            const dayStats = await tonicService.getStatsByCountry(credentials, dateStr);
            allStats.push(...dayStats.map((s: any) => ({ ...s, date: dateStr })));
          } catch (err: any) {
            console.error(`Error fetching stats for ${dateStr}:`, err.message);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Aggregate by campaign_id
        const aggregated = new Map<string, { clicks: number; revenue: number; dates: string[] }>();
        for (const stat of allStats) {
          const existing = aggregated.get(stat.campaign_id) || { clicks: 0, revenue: 0, dates: [] };
          existing.clicks += parseInt(stat.clicks || '0');
          existing.revenue += parseFloat(stat.revenue || '0');
          if (!existing.dates.includes(stat.date)) {
            existing.dates.push(stat.date);
          }
          aggregated.set(stat.campaign_id, existing);
        }

        result = {
          dateRange: { from: params.from, to: params.to },
          daysQueried: datesCalled.length,
          datesCalled,
          rawRecords: allStats.length,
          aggregatedByCampaign: Array.from(aggregated.entries()).map(([campaignId, data]) => ({
            campaign_id: campaignId,
            total_clicks: data.clicks,
            total_revenue: data.revenue.toFixed(2),
            days_with_data: data.dates.length,
          })),
        };
        break;

      case 'epc_final':
        // Date range endpoint - EPC Final
        if (!params?.from || !params?.to) {
          return NextResponse.json({ success: false, error: 'from y to son requeridos para epc_final' }, { status: 400 });
        }
        result = await tonicService.getFinalEPC(credentials, params.from, params.to, params.campaignId);
        break;

      case 'epc_daily':
        // Single date endpoint - EPC Daily
        if (!params?.date) {
          return NextResponse.json({ success: false, error: 'date es requerido para epc_daily' }, { status: 400 });
        }
        result = await tonicService.getDailyEPC(credentials, params.date, params.type);
        break;

      case 'campaign_list':
        result = await tonicService.getCampaignList(credentials, params?.state || 'active');
        break;

      case 'offers':
        result = await tonicService.getOffers(credentials, params?.type || 'rsoc');
        break;

      default:
        return NextResponse.json({ success: false, error: `Endpoint desconocido: ${endpoint}` }, { status: 400 });
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      endpoint,
      params,
      duration: `${duration}ms`,
      recordCount: Array.isArray(result) ? result.length : (typeof result === 'object' ? Object.keys(result).length : 1),
      data: result,
    });
  } catch (error: any) {
    console.error('Tonic Debug API Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      details: error.response?.data || null,
    }, { status: 500 });
  }
}
