import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService, TonicCredentials } from '@/services/tonic.service';
import { metaService } from '@/services/meta.service';
import { tiktokService } from '@/services/tiktok.service';
import { everGreenService } from '@/services/evergreen.service';

/**
 * GET /api/cron/daily-metrics
 * Daily cron job to snapshot metrics for all managers
 *
 * Runs at 6:00 AM UTC (1:00 AM Colombia time)
 * Captures yesterday's metrics since Tonic data has a 1-day lag
 *
 * Also updates EverGreen streaks for all campaigns
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (process.env.NODE_ENV === 'production' && cronSecret) {
      if (authHeader !== `Bearer ${cronSecret}`) {
        logger.warn('cron', 'Unauthorized daily-metrics cron request');
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    logger.info('cron', 'Starting daily metrics snapshot cron job');

    // Calculate yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const dateStr = yesterday.toISOString().split('T')[0];

    // Get all managers
    const managers = await prisma.manager.findMany({
      select: { id: true, name: true },
    });

    logger.info('cron', `Processing metrics for ${managers.length} managers`, { date: dateStr });

    const results = {
      managersProcessed: 0,
      campaignsProcessed: 0,
      errors: [] as string[],
    };

    // Process each manager
    for (const manager of managers) {
      try {
        // Get all campaigns for this manager that were ACTIVE yesterday
        const campaigns = await prisma.campaign.findMany({
          where: {
            createdById: manager.id,
            status: { in: ['ACTIVE', 'PAUSED', 'COMPLETED'] },
            launchedAt: { lte: yesterday },
          },
          include: {
            platforms: {
              include: {
                tonicAccount: true,
                metaAccount: true,
                tiktokAccount: true,
              },
            },
          },
        });

        let managerGrossRevenue = 0;
        let managerTotalSpend = 0;
        let activeCampaigns = 0;
        let campaignsLaunched = 0;

        // Count campaigns launched yesterday
        const launchedYesterday = await prisma.campaign.count({
          where: {
            createdById: manager.id,
            status: 'ACTIVE',
            launchedAt: {
              gte: yesterday,
              lt: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000),
            },
          },
        });
        campaignsLaunched = launchedYesterday;

        // Group campaigns by Tonic account for batch revenue fetching
        const tonicAccountCampaigns = new Map<string, { credentials: TonicCredentials; campaignIds: string[] }>();

        for (const campaign of campaigns) {
          if (campaign.status === 'ACTIVE') {
            activeCampaigns++;
          }

          // Group by Tonic account
          const tonicPlatform = campaign.platforms.find((p) => p.tonicAccount);
          if (tonicPlatform?.tonicAccount && campaign.tonicCampaignId) {
            const accountKey = tonicPlatform.tonicAccount.id;
            if (!tonicAccountCampaigns.has(accountKey)) {
              tonicAccountCampaigns.set(accountKey, {
                credentials: {
                  consumer_key: tonicPlatform.tonicAccount.tonicConsumerKey || '',
                  consumer_secret: tonicPlatform.tonicAccount.tonicConsumerSecret || '',
                },
                campaignIds: [],
              });
            }
            tonicAccountCampaigns.get(accountKey)!.campaignIds.push(campaign.tonicCampaignId);
          }
        }

        // Fetch revenue from Tonic (batched by account)
        const revenueByTonicId = new Map<string, number>();
        for (const [, { credentials, campaignIds }] of tonicAccountCampaigns) {
          try {
            const revenueMap = await tonicService.getCampaignGrossRevenueRange(
              credentials,
              dateStr,
              dateStr
            );
            for (const [tonicId, revenue] of revenueMap) {
              if (campaignIds.includes(tonicId)) {
                revenueByTonicId.set(tonicId, revenue);
              }
            }
          } catch (error: any) {
            logger.error('cron', `Failed to fetch Tonic revenue for manager ${manager.id}`, { error: error.message });
          }
        }

        // Calculate totals per campaign
        for (const campaign of campaigns) {
          // Get Tonic revenue
          if (campaign.tonicCampaignId && revenueByTonicId.has(campaign.tonicCampaignId)) {
            managerGrossRevenue += revenueByTonicId.get(campaign.tonicCampaignId) || 0;
          }

          // Get Meta spend
          const metaPlatform = campaign.platforms.find((p) => p.metaAccount && p.metaCampaignId);
          if (metaPlatform?.metaAccount && metaPlatform.metaCampaignId) {
            try {
              const insights = await metaService.getEntityInsights(
                metaPlatform.metaCampaignId,
                'campaign',
                'yesterday',
                metaPlatform.metaAccount.metaAccessToken || undefined
              );
              if (insights) {
                managerTotalSpend += insights.spend;
              }
            } catch (error: any) {
              // Don't log individual campaign errors, just skip
            }
          }

          // Get TikTok spend
          const tiktokPlatform = campaign.platforms.find((p) => p.tiktokAccount && p.tiktokCampaignId);
          if (tiktokPlatform?.tiktokAccount && tiktokPlatform.tiktokCampaignId) {
            try {
              const spendMap = await tiktokService.getAllCampaignsSpend(
                tiktokPlatform.tiktokAccount.tiktokAdvertiserId || '',
                tiktokPlatform.tiktokAccount.tiktokAccessToken || '',
                'yesterday'
              );
              managerTotalSpend += spendMap.get(tiktokPlatform.tiktokCampaignId) || 0;
            } catch (error: any) {
              // Don't log individual campaign errors, just skip
            }
          }

          results.campaignsProcessed++;
        }

        // Calculate net revenue and ROI
        const netRevenue = managerGrossRevenue - managerTotalSpend;
        const roi = managerTotalSpend > 0 ? ((netRevenue / managerTotalSpend) * 100) : 0;

        // Upsert daily metrics record
        await prisma.dailyMetrics.upsert({
          where: {
            date_managerId: {
              date: yesterday,
              managerId: manager.id,
            },
          },
          create: {
            date: yesterday,
            managerId: manager.id,
            grossRevenue: Math.round(managerGrossRevenue * 100) / 100,
            totalSpend: Math.round(managerTotalSpend * 100) / 100,
            netRevenue: Math.round(netRevenue * 100) / 100,
            roi: Math.round(roi * 100) / 100,
            activeCampaigns,
            campaignsLaunched,
          },
          update: {
            grossRevenue: Math.round(managerGrossRevenue * 100) / 100,
            totalSpend: Math.round(managerTotalSpend * 100) / 100,
            netRevenue: Math.round(netRevenue * 100) / 100,
            roi: Math.round(roi * 100) / 100,
            activeCampaigns,
            campaignsLaunched,
          },
        });

        results.managersProcessed++;

        logger.info('cron', `Processed metrics for manager ${manager.name}`, {
          grossRevenue: managerGrossRevenue.toFixed(2),
          totalSpend: managerTotalSpend.toFixed(2),
          netRevenue: netRevenue.toFixed(2),
          roi: roi.toFixed(2),
          activeCampaigns,
          campaignsLaunched,
        });
      } catch (managerError: any) {
        results.errors.push(`Manager ${manager.id}: ${managerError.message}`);
        logger.error('cron', `Error processing manager ${manager.id}`, { error: managerError.message });
      }
    }

    // Update EverGreen streaks
    logger.info('cron', 'Updating EverGreen streaks');
    const everGreenResult = await everGreenService.updateAllStreaks();

    const duration = Date.now() - startTime;
    logger.success('cron', 'Daily metrics snapshot complete', {
      managersProcessed: results.managersProcessed,
      campaignsProcessed: results.campaignsProcessed,
      errors: results.errors.length,
      everGreen: {
        campaignsChecked: everGreenResult.campaignsChecked,
        qualifiedToday: everGreenResult.qualifiedToday,
        newEverGreens: everGreenResult.newEverGreens,
      },
    }, duration);

    return NextResponse.json({
      success: true,
      data: {
        date: dateStr,
        managersProcessed: results.managersProcessed,
        campaignsProcessed: results.campaignsProcessed,
        errors: results.errors,
        everGreen: everGreenResult,
        durationMs: duration,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('cron', `Daily metrics cron failed: ${error.message}`, { error, duration });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
