import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tonicService } from '@/services/tonic.service';
import { logger } from '@/lib/logger';

/**
 * Diagnostic Endpoint: Test Tonic Accounts
 *
 * This endpoint tests all Tonic accounts to determine their capabilities:
 * - Which accounts support RSOC
 * - Which accounts support Display
 * - Available RSOC domains and languages
 * - Authentication status
 *
 * URL: GET /api/diagnostic/tonic-test
 */

export async function GET(request: NextRequest) {
  try {
    logger.info('system', '🔍 Starting Tonic accounts diagnostic...');

    // Get all Tonic accounts from database
    const tonicAccounts = await prisma.account.findMany({
      where: {
        accountType: 'TONIC',
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        tonicConsumerKey: true,
        tonicConsumerSecret: true,
        isActive: true,
      },
    });

    if (tonicAccounts.length === 0) {
      return NextResponse.json(
        { error: 'No Tonic accounts found in database' },
        { status: 404 }
      );
    }

    logger.info('system', `Found ${tonicAccounts.length} Tonic account(s) to test`);

    const results = [];

    // Test each account
    for (const account of tonicAccounts) {
      logger.info('system', `\n${'='.repeat(60)}`);
      logger.info('system', `Testing account: ${account.name}`);
      logger.info('system', `${'='.repeat(60)}`);

      const accountResult: any = {
        accountId: account.id,
        accountName: account.name,
        consumerKey: account.tonicConsumerKey?.substring(0, 20) + '...',
        tests: {},
      };

      try {
        // 1. Test Authentication
        logger.info('system', '🔐 Test 1: Authentication...');
        const credentials = {
          consumer_key: account.tonicConsumerKey!,
          consumer_secret: account.tonicConsumerSecret!,
        };

        const token = await tonicService.authenticate(credentials);
        accountResult.tests.authentication = {
          status: 'SUCCESS',
          message: 'Authentication successful',
          tokenPreview: token.substring(0, 30) + '...',
        };
        logger.success('system', '✅ Authentication: PASSED');

        // 2. Test RSOC Support
        logger.info('system', '📝 Test 2: RSOC Support...');
        try {
          const rsocDomains = await tonicService.getRSOCDomains(credentials);

          if (rsocDomains && rsocDomains.length > 0) {
            accountResult.tests.rsocSupport = {
              status: 'SUCCESS',
              supported: true,
              domains: rsocDomains,
              domainsCount: rsocDomains.length,
              message: `Account supports RSOC with ${rsocDomains.length} domain(s)`,
            };
            logger.success('system', `✅ RSOC Support: YES (${rsocDomains.length} domains)`);

            // Log domains details
            rsocDomains.forEach((domain: any) => {
              logger.info('system', `   - Domain: ${domain.domain}, Languages: ${domain.languages?.join(', ') || 'N/A'}`);
            });
          } else {
            accountResult.tests.rsocSupport = {
              status: 'INFO',
              supported: false,
              message: 'Account does not support RSOC (empty domains list)',
            };
            logger.info('system', 'ℹ️  RSOC Support: NO (empty domains)');
          }
        } catch (error: any) {
          accountResult.tests.rsocSupport = {
            status: 'INFO',
            supported: false,
            error: error.message,
            message: 'Account does not support RSOC (API error)',
          };
          logger.info('system', `ℹ️  RSOC Support: NO (${error.message})`);
        }

        // 3. Test Display Offers
        logger.info('system', '🎨 Test 3: Display Offers...');
        try {
          const displayOffers = await tonicService.getOffers(credentials, 'display');
          accountResult.tests.displayOffers = {
            status: 'SUCCESS',
            supported: true,
            offersCount: displayOffers.length,
            message: `Account has access to ${displayOffers.length} display offer(s)`,
            sampleOffers: displayOffers.slice(0, 3).map((o: any) => ({
              id: o.id,
              name: o.name,
            })),
          };
          logger.success('system', `✅ Display Offers: ${displayOffers.length} offers available`);
        } catch (error: any) {
          accountResult.tests.displayOffers = {
            status: 'ERROR',
            supported: false,
            error: error.message,
            message: 'Failed to fetch display offers',
          };
          logger.error('system', `❌ Display Offers: FAILED (${error.message})`);
        }

        // 4. Test RSOC Offers (if RSOC is supported)
        if (accountResult.tests.rsocSupport?.supported) {
          logger.info('system', '📄 Test 4: RSOC Offers...');
          try {
            const rsocOffers = await tonicService.getOffers(credentials, 'rsoc');
            accountResult.tests.rsocOffers = {
              status: 'SUCCESS',
              supported: true,
              offersCount: rsocOffers.length,
              message: `Account has access to ${rsocOffers.length} RSOC offer(s)`,
              sampleOffers: rsocOffers.slice(0, 3).map((o: any) => ({
                id: o.id,
                name: o.name,
              })),
            };
            logger.success('system', `✅ RSOC Offers: ${rsocOffers.length} offers available`);
          } catch (error: any) {
            accountResult.tests.rsocOffers = {
              status: 'ERROR',
              supported: false,
              error: error.message,
              message: 'Failed to fetch RSOC offers',
            };
            logger.error('system', `❌ RSOC Offers: FAILED (${error.message})`);
          }
        }

        // 5. Test Campaign List
        logger.info('system', '📋 Test 5: Campaign List...');
        try {
          const campaigns = await tonicService.getCampaignList(credentials);
          accountResult.tests.campaignList = {
            status: 'SUCCESS',
            campaignsCount: campaigns.length,
            message: `Account has ${campaigns.length} active campaign(s)`,
            sampleCampaigns: campaigns.slice(0, 3).map((c: any) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              country: c.country,
            })),
          };
          logger.success('system', `✅ Campaign List: ${campaigns.length} campaigns`);
        } catch (error: any) {
          accountResult.tests.campaignList = {
            status: 'ERROR',
            error: error.message,
            message: 'Failed to fetch campaign list',
          };
          logger.error('system', `❌ Campaign List: FAILED (${error.message})`);
        }

        // Summary
        accountResult.summary = {
          overallStatus: 'HEALTHY',
          canCreateDisplay: accountResult.tests.displayOffers?.supported ?? false,
          canCreateRSOC: accountResult.tests.rsocSupport?.supported ?? false,
          recommendation: accountResult.tests.rsocSupport?.supported
            ? `✅ Use this account for RSOC campaigns`
            : `✅ Use this account for Display campaigns`,
        };

      } catch (error: any) {
        accountResult.summary = {
          overallStatus: 'ERROR',
          error: error.message,
          recommendation: '❌ This account has issues and should not be used',
        };
        logger.error('system', `❌ Account ${account.name} failed: ${error.message}`);
      }

      results.push(accountResult);
    }

    // Generate overall recommendation
    const rsocAccounts = results.filter((r) => r.summary?.canCreateRSOC);
    const displayAccounts = results.filter((r) => r.summary?.canCreateDisplay);

    const overallRecommendation = {
      totalAccounts: results.length,
      healthyAccounts: results.filter((r) => r.summary?.overallStatus === 'HEALTHY').length,
      rsocCapableAccounts: rsocAccounts.length,
      displayCapableAccounts: displayAccounts.length,
      recommendations: {
        forRSOC: rsocAccounts.length > 0
          ? `Use account: ${rsocAccounts[0].accountName}`
          : 'No RSOC-capable accounts found',
        forDisplay: displayAccounts.length > 0
          ? `Use account: ${displayAccounts[0].accountName}`
          : 'No Display-capable accounts found',
        forMeta: results.find((r) => r.accountName.includes('Meta'))
          ? `Use account: ${results.find((r) => r.accountName.includes('Meta'))?.accountName}`
          : 'Create a Tonic account for Meta campaigns',
        forTikTok: results.find((r) => r.accountName.includes('TikTok'))
          ? `Use account: ${results.find((r) => r.accountName.includes('TikTok'))?.accountName}`
          : 'Create a Tonic account for TikTok campaigns',
      },
    };

    logger.info('system', '\n' + '='.repeat(60));
    logger.info('system', '📊 DIAGNOSTIC SUMMARY');
    logger.info('system', '='.repeat(60));
    logger.info('system', `Total Accounts: ${overallRecommendation.totalAccounts}`);
    logger.info('system', `Healthy Accounts: ${overallRecommendation.healthyAccounts}`);
    logger.info('system', `RSOC-Capable: ${overallRecommendation.rsocCapableAccounts}`);
    logger.info('system', `Display-Capable: ${overallRecommendation.displayCapableAccounts}`);
    logger.info('system', '='.repeat(60));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
      summary: overallRecommendation,
    });
  } catch (error: any) {
    logger.error('system', `Diagnostic failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
