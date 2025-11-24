import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../lib/prisma';
import { AccountType } from '@prisma/client';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n🔍 LaunchPro Account Debug Tool\n');
  console.log('='.repeat(60));

  while (true) {
    console.log('\n📋 MENU:');
    console.log('1. View all accounts status');
    console.log('2. View Global Settings');
    console.log('3. Configure TikTok Pixel IDs manually');
    console.log('4. Configure Meta Pixel IDs manually');
    console.log('5. Test TikTok API connection');
    console.log('6. Exit');
    console.log('');

    const choice = await question('Select option (1-6): ');

    switch (choice.trim()) {
      case '1':
        await viewAllAccounts();
        break;
      case '2':
        await viewGlobalSettings();
        break;
      case '3':
        await configureTikTokPixels();
        break;
      case '4':
        await configureMetaPixels();
        break;
      case '5':
        await testTikTokAPI();
        break;
      case '6':
        console.log('\n👋 Goodbye!\n');
        rl.close();
        await prisma.$disconnect();
        process.exit(0);
      default:
        console.log('\n❌ Invalid option\n');
    }
  }
}

async function viewAllAccounts() {
  console.log('\n📊 ALL ACCOUNTS STATUS\n');
  console.log('='.repeat(80));

  const accounts = await prisma.account.findMany({
    orderBy: [{ accountType: 'asc' }, { name: 'asc' }]
  });

  for (const account of accounts) {
    const issues: string[] = [];

    console.log(`\n${account.accountType} - ${account.name}`);
    console.log('-'.repeat(80));
    console.log(`ID: ${account.id}`);

    if (account.accountType === 'TONIC') {
      console.log(`Consumer Key: ${account.tonicConsumerKey ? '✅ Set' : '❌ Missing'}`);
      console.log(`Consumer Secret: ${account.tonicConsumerSecret ? '✅ Set' : '❌ Missing'}`);
      if (!account.tonicConsumerKey) issues.push('Missing consumer key');
      if (!account.tonicConsumerSecret) issues.push('Missing consumer secret');
    }

    if (account.accountType === 'META') {
      console.log(`Ad Account ID: ${account.metaAdAccountId || '❌ Missing'}`);
      console.log(`Portfolio: ${account.metaPortfolio || 'N/A'}`);
      console.log(`Page ID: ${account.metaPageId || 'N/A'}`);
      console.log(`Access Token: ${account.metaAccessToken ? '✅ Set' : '⚠️  Using Global'}`);
      console.log(`Pixel ID: ${account.metaPixelId || '❌ Missing'}`);
      if (!account.metaAdAccountId) issues.push('Missing ad account ID');
      if (!account.metaPixelId) issues.push('Missing pixel ID');
    }

    if (account.accountType === 'TIKTOK') {
      console.log(`Advertiser ID: ${account.tiktokAdvertiserId || '❌ Missing'}`);
      console.log(`Access Token: ${account.tiktokAccessToken ? '✅ Set' : '⚠️  Using Global'}`);
      console.log(`Pixel ID: ${account.tiktokPixelId || '❌ Missing (can auto-fetch if token has permission)'}`);
      if (!account.tiktokAdvertiserId) issues.push('Missing advertiser ID');
      if (!account.tiktokPixelId) issues.push('Missing pixel ID');
    }

    if (issues.length > 0) {
      console.log(`\n⚠️  ISSUES:`);
      issues.forEach(issue => console.log(`   - ${issue}`));
    } else {
      console.log(`\n✅ Account fully configured`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\nTotal accounts: ${accounts.length}`);
  console.log(`- Tonic: ${accounts.filter(a => a.accountType === 'TONIC').length}`);
  console.log(`- Meta: ${accounts.filter(a => a.accountType === 'META').length}`);
  console.log(`- TikTok: ${accounts.filter(a => a.accountType === 'TIKTOK').length}`);
}

async function viewGlobalSettings() {
  console.log('\n🌐 GLOBAL SETTINGS\n');
  console.log('='.repeat(80));

  const settings = await prisma.globalSettings.findUnique({
    where: { id: 'global-settings' }
  });

  if (!settings) {
    console.log('❌ Global settings not found!');
    return;
  }

  console.log(`Anthropic API Key: ${settings.anthropicApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`GCP Project ID: ${settings.gcpProjectId || '❌ Missing'}`);
  console.log(`GCP Storage Bucket: ${settings.gcpStorageBucket || '❌ Missing'}`);
  console.log(`GCP Location: ${settings.gcpLocation || 'N/A'}`);
  console.log(`\nMeta App ID: ${settings.metaAppId || '❌ Missing'}`);
  console.log(`Meta App Secret: ${settings.metaAppSecret ? '✅ Set' : '❌ Missing'}`);
  console.log(`Meta Access Token: ${settings.metaAccessToken ? `✅ Set (${settings.metaAccessToken.substring(0, 20)}...)` : '❌ Missing'}`);
  console.log(`\nTikTok Access Token: ${settings.tiktokAccessToken ? `✅ Set (${settings.tiktokAccessToken.substring(0, 20)}...)` : '❌ Missing'}`);

  console.log('\n' + '='.repeat(80));
}

async function configureTikTokPixels() {
  console.log('\n🎵 CONFIGURE TIKTOK PIXEL IDs\n');
  console.log('='.repeat(80));

  const tiktokAccounts = await prisma.account.findMany({
    where: { accountType: 'TIKTOK' },
    orderBy: { name: 'asc' }
  });

  if (tiktokAccounts.length === 0) {
    console.log('No TikTok accounts found.');
    return;
  }

  console.log('\nTikTok Accounts:');
  tiktokAccounts.forEach((acc, idx) => {
    console.log(`${idx + 1}. ${acc.name} (Advertiser: ${acc.tiktokAdvertiserId})`);
    console.log(`   Current Pixel ID: ${acc.tiktokPixelId || 'Not set'}`);
  });

  const choice = await question('\nSelect account number (or 0 to cancel): ');
  const accountIndex = parseInt(choice) - 1;

  if (accountIndex < 0 || accountIndex >= tiktokAccounts.length) {
    console.log('Cancelled.');
    return;
  }

  const account = tiktokAccounts[accountIndex];
  const pixelId = await question(`\nEnter Pixel ID for "${account.name}": `);

  if (!pixelId.trim()) {
    console.log('Cancelled.');
    return;
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { tiktokPixelId: pixelId.trim() }
  });

  console.log(`\n✅ Pixel ID configured for ${account.name}`);
}

async function configureMetaPixels() {
  console.log('\n📘 CONFIGURE META PIXEL IDs\n');
  console.log('='.repeat(80));

  const metaAccounts = await prisma.account.findMany({
    where: { accountType: 'META' },
    orderBy: { name: 'asc' }
  });

  if (metaAccounts.length === 0) {
    console.log('No Meta accounts found.');
    return;
  }

  console.log('\nMeta Accounts:');
  metaAccounts.forEach((acc, idx) => {
    console.log(`${idx + 1}. ${acc.name} (Ad Account: ${acc.metaAdAccountId})`);
    console.log(`   Current Pixel ID: ${acc.metaPixelId || 'Not set'}`);
  });

  const choice = await question('\nSelect account number (or 0 to cancel): ');
  const accountIndex = parseInt(choice) - 1;

  if (accountIndex < 0 || accountIndex >= metaAccounts.length) {
    console.log('Cancelled.');
    return;
  }

  const account = metaAccounts[accountIndex];
  const pixelId = await question(`\nEnter Pixel ID for "${account.name}": `);

  if (!pixelId.trim()) {
    console.log('Cancelled.');
    return;
  }

  await prisma.account.update({
    where: { id: account.id },
    data: { metaPixelId: pixelId.trim() }
  });

  console.log(`\n✅ Pixel ID configured for ${account.name}`);
}

async function testTikTokAPI() {
  console.log('\n🧪 TEST TIKTOK API CONNECTION\n');
  console.log('='.repeat(80));

  const settings = await prisma.globalSettings.findUnique({
    where: { id: 'global-settings' }
  });

  if (!settings?.tiktokAccessToken) {
    console.log('❌ No TikTok access token in global settings');
    return;
  }

  console.log(`Using token: ${settings.tiktokAccessToken.substring(0, 20)}...`);

  const tiktokAccounts = await prisma.account.findMany({
    where: { accountType: 'TIKTOK' },
    orderBy: { name: 'asc' }
  });

  console.log(`\nFound ${tiktokAccounts.length} TikTok account(s)\n`);

  for (const account of tiktokAccounts) {
    if (!account.tiktokAdvertiserId) {
      console.log(`⏭️  Skipping ${account.name} (no advertiser ID)`);
      continue;
    }

    console.log(`Testing ${account.name} (${account.tiktokAdvertiserId})...`);

    try {
      const axios = require('axios');
      const response = await axios.get('https://business-api.tiktok.com/open_api/v1.3/pixel/list/', {
        params: {
          advertiser_id: account.tiktokAdvertiserId,
          page: 1,
          page_size: 10
        },
        headers: {
          'Access-Token': settings.tiktokAccessToken,
          'Content-Type': 'application/json',
        },
      });

      if (response.data.code === 0) {
        const pixels = response.data.data?.list || [];
        console.log(`  ✅ Success! Found ${pixels.length} pixel(s)`);
        if (pixels.length > 0) {
          pixels.forEach((p: any, idx: number) => {
            console.log(`     ${idx + 1}. ${p.pixel_id} - ${p.pixel_name || 'Unnamed'}`);
          });
        }
      } else {
        console.log(`  ❌ API Error: [${response.data.code}] ${response.data.message}`);
      }
    } catch (error: any) {
      console.log(`  ❌ Error: ${error.message}`);
      if (error.response?.data) {
        console.log(`     API Response:`, JSON.stringify(error.response.data, null, 2));
      }
    }
  }
}

main().catch(console.error);
