/**
 * LOCAL DEBUG SCRIPT: Test Campaign Launch Flow
 *
 * This script simulates what the process-campaigns cron does,
 * but runs locally so we can see ALL console logs in real-time.
 *
 * Usage:
 *   npx tsx scripts/test-campaign-launch.ts [campaignId]
 *
 * If no campaignId is provided, it will find the first ARTICLE_APPROVED campaign.
 */

import 'dotenv/config';
import { PrismaClient, CampaignStatus } from '@prisma/client';

// Force colored console output
process.env.FORCE_COLOR = '1';

console.log('\n');
console.log('='.repeat(80));
console.log('🔬 LOCAL DEBUG: Campaign Launch Test');
console.log('='.repeat(80));
console.log('\n');

// STEP 1: Environment Check
console.log('📋 STEP 1: Environment Variables Check');
console.log('-'.repeat(40));

const envCheck = {
  DATABASE_URL: {
    exists: !!process.env.DATABASE_URL,
    preview: process.env.DATABASE_URL?.substring(0, 30) + '...',
  },
  GEMINI_API_KEY: {
    exists: !!process.env.GEMINI_API_KEY,
    prefix: process.env.GEMINI_API_KEY?.substring(0, 10),
    length: process.env.GEMINI_API_KEY?.length,
    looksLikeAnthropicKey: process.env.GEMINI_API_KEY?.startsWith('sk-ant'),
  },
  GOOGLE_AI_API_KEY: {
    exists: !!process.env.GOOGLE_AI_API_KEY,
    prefix: process.env.GOOGLE_AI_API_KEY?.substring(0, 10),
  },
  ANTHROPIC_API_KEY: {
    exists: !!process.env.ANTHROPIC_API_KEY,
    WARNING: process.env.ANTHROPIC_API_KEY ? '⚠️ ANTHROPIC_API_KEY IS SET - This should NOT be used!' : null,
  },
  TIKTOK_ACCESS_TOKEN: {
    exists: !!process.env.TIKTOK_ACCESS_TOKEN,
    prefix: process.env.TIKTOK_ACCESS_TOKEN?.substring(0, 15),
    length: process.env.TIKTOK_ACCESS_TOKEN?.length,
    looksLikeAnthropicKey: process.env.TIKTOK_ACCESS_TOKEN?.startsWith('sk-ant'),
  },
  META_ACCESS_TOKEN: {
    exists: !!process.env.META_ACCESS_TOKEN,
    prefix: process.env.META_ACCESS_TOKEN?.substring(0, 15),
    length: process.env.META_ACCESS_TOKEN?.length,
  },
};

console.log(JSON.stringify(envCheck, null, 2));
console.log('\n');

// Check for critical issues
if (envCheck.GEMINI_API_KEY.looksLikeAnthropicKey) {
  console.log('🚨🚨🚨 CRITICAL: GEMINI_API_KEY starts with "sk-ant" - THIS IS AN ANTHROPIC KEY!');
  console.log('🚨🚨🚨 This is likely the source of the 401 error!');
  process.exit(1);
}

if (envCheck.TIKTOK_ACCESS_TOKEN.looksLikeAnthropicKey) {
  console.log('🚨🚨🚨 CRITICAL: TIKTOK_ACCESS_TOKEN starts with "sk-ant" - THIS IS AN ANTHROPIC KEY!');
  console.log('🚨🚨🚨 This is likely the source of the 401 error!');
  process.exit(1);
}

if (envCheck.ANTHROPIC_API_KEY.exists) {
  console.log('⚠️ WARNING: ANTHROPIC_API_KEY is set in your environment.');
  console.log('⚠️ The code should NOT use this, but it\'s suspicious that it exists.');
}

// STEP 2: Database Connection
console.log('📋 STEP 2: Database Connection');
console.log('-'.repeat(40));

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully\n');

    // STEP 3: Find or use campaign
    console.log('📋 STEP 3: Finding Campaign to Test');
    console.log('-'.repeat(40));

    const campaignId = process.argv[2];
    let campaign;

    if (campaignId) {
      campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          platforms: { include: { tonicAccount: true } },
          offer: true,
          media: true,
        },
      });
      if (!campaign) {
        console.log(`❌ Campaign ${campaignId} not found`);
        process.exit(1);
      }
    } else {
      // Find first ARTICLE_APPROVED campaign
      campaign = await prisma.campaign.findFirst({
        where: { status: CampaignStatus.ARTICLE_APPROVED },
        include: {
          platforms: { include: { tonicAccount: true } },
          offer: true,
          media: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!campaign) {
        console.log('❌ No ARTICLE_APPROVED campaigns found.');
        console.log('Looking for any recent campaign to show status...\n');

        const recentCampaigns = await prisma.campaign.findMany({
          select: { id: true, name: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        console.log('Recent campaigns:');
        recentCampaigns.forEach(c => {
          console.log(`  - ${c.name} (${c.id}): ${c.status}`);
        });

        console.log('\nTo test a specific campaign, run:');
        console.log('  npx tsx scripts/test-campaign-launch.ts <campaignId>');
        process.exit(0);
      }
    }

    console.log(`\n✅ Found campaign: "${campaign.name}" (${campaign.id})`);
    console.log(`   Status: ${campaign.status}`);
    console.log(`   Tracking Link: ${campaign.tonicTrackingLink || 'NONE'}`);
    console.log(`   Platforms: ${campaign.platforms.map(p => p.platform).join(', ')}`);
    console.log(`   Media: ${campaign.media.length} files`);
    console.log('\n');

    // STEP 4: Check TikTok Account credentials
    console.log('📋 STEP 4: TikTok Account Credentials Check');
    console.log('-'.repeat(40));

    const tiktokPlatform = campaign.platforms.find(p => p.platform === 'TIKTOK');
    if (tiktokPlatform) {
      const accountId = tiktokPlatform.tiktokAccountId;
      if (accountId) {
        const tiktokAccount = await prisma.account.findUnique({
          where: { id: accountId },
        });

        if (tiktokAccount) {
          console.log(`TikTok Account: "${tiktokAccount.name}"`);
          console.log(`  Advertiser ID: ${tiktokAccount.tiktokAdvertiserId}`);
          console.log(`  Access Token exists: ${!!tiktokAccount.tiktokAccessToken}`);
          console.log(`  Access Token prefix: ${tiktokAccount.tiktokAccessToken?.substring(0, 15)}`);
          console.log(`  Token looks like Anthropic key: ${tiktokAccount.tiktokAccessToken?.startsWith('sk-ant')}`);

          if (tiktokAccount.tiktokAccessToken?.startsWith('sk-ant')) {
            console.log('\n🚨🚨🚨 CRITICAL: TikTok Access Token in DATABASE starts with "sk-ant"!');
            console.log('🚨🚨🚨 This is an ANTHROPIC API KEY stored as TikTok token!');
            console.log('🚨🚨🚨 THIS IS THE SOURCE OF THE 401 ERROR!');
          }
        } else {
          console.log(`  ⚠️ Account ${accountId} not found in database`);
        }
      }
    }

    // Check Global Settings
    const globalSettings = await prisma.globalSettings.findUnique({
      where: { id: 'global-settings' },
    });

    if (globalSettings) {
      console.log('\nGlobal Settings:');
      console.log(`  TikTok Token exists: ${!!globalSettings.tiktokAccessToken}`);
      console.log(`  TikTok Token prefix: ${globalSettings.tiktokAccessToken?.substring(0, 15)}`);
      console.log(`  Token looks like Anthropic key: ${globalSettings.tiktokAccessToken?.startsWith('sk-ant')}`);

      if (globalSettings.tiktokAccessToken?.startsWith('sk-ant')) {
        console.log('\n🚨🚨🚨 CRITICAL: Global TikTok Token starts with "sk-ant"!');
        console.log('🚨🚨🚨 This is an ANTHROPIC API KEY stored as TikTok token!');
      }
    }

    console.log('\n');

    // STEP 5: Test AI Service Import
    console.log('📋 STEP 5: Loading AI Service');
    console.log('-'.repeat(40));

    // Dynamic import to see all the console.logs from the service
    const { aiService } = await import('../services/ai.service');
    console.log('✅ AI Service loaded\n');

    // STEP 6: Test a simple Gemini call
    console.log('📋 STEP 6: Test Gemini API Call');
    console.log('-'.repeat(40));
    console.log('Making a simple test call to Gemini...\n');

    try {
      const testAdCopy = await aiService.generateAdCopy({
        offerName: 'Test Offer',
        copyMaster: 'This is a test copy master for debugging',
        platform: 'TIKTOK',
        adFormat: 'VIDEO',
        country: 'US',
        language: 'en',
      });

      console.log('✅ Gemini API call SUCCEEDED!');
      console.log('Generated ad copy:', JSON.stringify(testAdCopy, null, 2));
    } catch (error: any) {
      console.log('\n🔴🔴🔴 GEMINI API CALL FAILED!');
      console.log('🔴 Error name:', error.name);
      console.log('🔴 Error message:', error.message);
      console.log('🔴 Error code:', error.code);
      console.log('🔴 Is Axios error:', error.isAxiosError);
      console.log('🔴 Response status:', error.response?.status);
      console.log('🔴 Response data:', JSON.stringify(error.response?.data || {}, null, 2));
      console.log('🔴 Request URL:', error.config?.url);
      console.log('🔴 Full error:', error);

      if (error.message?.includes('x-api-key') || error.message?.includes('anthropic')) {
        console.log('\n🚨🚨🚨 ERROR CONTAINS ANTHROPIC PATTERNS!');
        console.log('🚨🚨🚨 This confirms the error is related to Anthropic API!');
      }
    }

    console.log('\n');
    console.log('='.repeat(80));
    console.log('🔬 DEBUG SESSION COMPLETE');
    console.log('='.repeat(80));

  } catch (error: any) {
    console.error('Fatal error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
