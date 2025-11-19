import { NextRequest, NextResponse } from 'next/server';
import { tonicService } from '@/services/tonic.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/diagnostic/tonic
 * Diagnostic tool to test Tonic API permissions and capabilities
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (!accountId) {
    return NextResponse.json({
      success: false,
      error: 'accountId parameter is required',
    }, { status: 400 });
  }

  try {
    logger.info('system', `Running Tonic diagnostics for account ${accountId}`);

    // Get account credentials
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.tonicConsumerKey || !account.tonicConsumerSecret) {
      return NextResponse.json({
        success: false,
        error: 'Account not found or missing credentials',
      }, { status: 404 });
    }

    const credentials = {
      consumer_key: account.tonicConsumerKey,
      consumer_secret: account.tonicConsumerSecret,
    };

    const diagnosticResults: any = {
      accountName: account.name,
      timestamp: new Date().toISOString(),
      tests: [],
    };

    // Test 1: Authentication
    logger.info('system', 'Test 1: Authentication');
    try {
      const token = await tonicService['authenticate'](credentials);
      diagnosticResults.tests.push({
        test: 'Authentication',
        status: 'PASS',
        message: 'Successfully authenticated with Tonic API',
        details: {
          tokenLength: token.length,
          tokenPreview: `${token.substring(0, 20)}...`,
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Authentication',
        status: 'FAIL',
        message: error.message,
        error: error.response?.data,
      });
      // If auth fails, no point in continuing
      return NextResponse.json({
        success: false,
        error: 'Authentication failed',
        diagnostics: diagnosticResults,
      }, { status: 401 });
    }

    // Test 2: Get Offers (Display)
    logger.info('system', 'Test 2: Get Display Offers');
    try {
      const displayOffers = await tonicService.getOffers(credentials, 'display');
      diagnosticResults.tests.push({
        test: 'Get Display Offers',
        status: 'PASS',
        message: `Found ${displayOffers.length} display offers`,
        details: {
          count: displayOffers.length,
          sampleOffers: displayOffers.slice(0, 3).map((o: any) => ({ id: o.id, name: o.name })),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get Display Offers',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 3: Get Offers (RSOC)
    logger.info('system', 'Test 3: Get RSOC Offers');
    try {
      const rsocOffers = await tonicService.getOffers(credentials, 'rsoc');
      diagnosticResults.tests.push({
        test: 'Get RSOC Offers',
        status: 'PASS',
        message: `Found ${rsocOffers.length} RSOC offers`,
        details: {
          count: rsocOffers.length,
          sampleOffers: rsocOffers.slice(0, 3).map((o: any) => ({ id: o.id, name: o.name })),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get RSOC Offers',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 4: Get RSOC Domains
    logger.info('system', 'Test 4: Get RSOC Domains');
    try {
      const domains = await tonicService.getRSOCDomains(credentials);
      diagnosticResults.tests.push({
        test: 'Get RSOC Domains',
        status: 'PASS',
        message: `Found ${domains.length} RSOC domains`,
        details: {
          domains: domains.map((d: any) => ({ domain: d.domain, languages: d.languages })),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get RSOC Domains',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 5: Get Existing Campaigns (Display)
    logger.info('system', 'Test 5: Get Existing Display Campaigns');
    try {
      const campaigns = await tonicService.getCampaignList(credentials, 'active');
      const displayCampaigns = campaigns.filter((c: any) => c.type === 'display');
      diagnosticResults.tests.push({
        test: 'Get Display Campaigns',
        status: 'PASS',
        message: `Found ${displayCampaigns.length} display campaigns`,
        details: {
          count: displayCampaigns.length,
          sampleCampaigns: displayCampaigns.slice(0, 3).map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            country: c.country
          })),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get Display Campaigns',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 6: Get Existing Campaigns (RSOC)
    logger.info('system', 'Test 6: Get Existing RSOC Campaigns');
    try {
      const campaigns = await tonicService.getCampaignList(credentials, 'active');
      const rsocCampaigns = campaigns.filter((c: any) => c.type === 'rsoc');
      diagnosticResults.tests.push({
        test: 'Get RSOC Campaigns',
        status: 'PASS',
        message: `Found ${rsocCampaigns.length} RSOC campaigns`,
        details: {
          count: rsocCampaigns.length,
          sampleCampaigns: rsocCampaigns.slice(0, 3).map((c: any) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            country: c.country
          })),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get RSOC Campaigns',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 7: Get Countries (Display)
    logger.info('system', 'Test 7: Get Display Countries');
    try {
      const countries = await tonicService.getCountries(credentials, 'display');
      diagnosticResults.tests.push({
        test: 'Get Display Countries',
        status: 'PASS',
        message: `Found ${countries.length} countries for display`,
        details: {
          count: countries.length,
          sampleCountries: countries.slice(0, 5).map((c: any) => c.code),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get Display Countries',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Test 8: Get Countries (RSOC)
    logger.info('system', 'Test 8: Get RSOC Countries');
    try {
      const countries = await tonicService.getCountries(credentials, 'rsoc');
      diagnosticResults.tests.push({
        test: 'Get RSOC Countries',
        status: 'PASS',
        message: `Found ${countries.length} countries for RSOC`,
        details: {
          count: countries.length,
          sampleCountries: countries.slice(0, 5).map((c: any) => c.code),
        },
      });
    } catch (error: any) {
      diagnosticResults.tests.push({
        test: 'Get RSOC Countries',
        status: 'FAIL',
        message: error.message,
      });
    }

    // Summary
    const totalTests = diagnosticResults.tests.length;
    const passedTests = diagnosticResults.tests.filter((t: any) => t.status === 'PASS').length;
    const failedTests = totalTests - passedTests;

    diagnosticResults.summary = {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      successRate: `${Math.round((passedTests / totalTests) * 100)}%`,
    };

    // Recommendations
    diagnosticResults.recommendations = [];

    if (failedTests === 0) {
      diagnosticResults.recommendations.push({
        type: 'SUCCESS',
        message: 'All tests passed! This account has full access to Tonic API.',
      });
    }

    const hasRSOCOffers = diagnosticResults.tests.find((t: any) =>
      t.test === 'Get RSOC Offers' && t.status === 'PASS' && t.details?.count > 0
    );
    const hasRSOCCampaigns = diagnosticResults.tests.find((t: any) =>
      t.test === 'Get RSOC Campaigns' && t.status === 'PASS'
    );

    if (hasRSOCOffers && hasRSOCCampaigns) {
      diagnosticResults.recommendations.push({
        type: 'INFO',
        message: 'This account supports RSOC campaigns. Use type="rsoc" when creating campaigns.',
      });
    }

    const hasDisplayOffers = diagnosticResults.tests.find((t: any) =>
      t.test === 'Get Display Offers' && t.status === 'PASS' && t.details?.count > 0
    );

    if (hasDisplayOffers && !hasRSOCOffers) {
      diagnosticResults.recommendations.push({
        type: 'WARNING',
        message: 'This account only supports Display campaigns, not RSOC.',
      });
    }

    logger.success('system', `Diagnostics complete: ${passedTests}/${totalTests} tests passed`);

    return NextResponse.json({
      success: true,
      diagnostics: diagnosticResults,
    });

  } catch (error: any) {
    logger.error('system', `Diagnostic failed: ${error.message}`);
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
