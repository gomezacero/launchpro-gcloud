#!/usr/bin/env node
/**
 * Test script to diagnose Meta and TikTok API credentials
 * Run: node test-credentials.js
 */

const axios = require('axios');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

async function testMetaAccess() {
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}  Testing Meta (Facebook) API Access${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

  const token = process.env.META_ACCESS_TOKEN;

  if (!token) {
    console.log(`${colors.red}❌ META_ACCESS_TOKEN not found in .env${colors.reset}`);
    return false;
  }

  console.log(`${colors.yellow}🔑 Token: ${token.substring(0, 20)}...${colors.reset}`);

  try {
    // Test 1: Get user info
    console.log('\n📝 Test 1: Getting user info...');
    const userResponse = await axios.get(
      `https://graph.facebook.com/v21.0/me`,
      {
        params: { access_token: token },
      }
    );
    console.log(`${colors.green}✅ User authenticated: ${userResponse.data.name} (ID: ${userResponse.data.id})${colors.reset}`);

    // Test 2: Get ad accounts
    console.log('\n📝 Test 2: Fetching ad accounts...');
    const accountsResponse = await axios.get(
      `https://graph.facebook.com/v21.0/me/adaccounts`,
      {
        params: {
          access_token: token,
          fields: 'id,name,account_status,currency,timezone_name,business_name',
          limit: 100,
        },
      }
    );

    const accounts = accountsResponse.data.data || [];
    console.log(`${colors.green}✅ Found ${accounts.length} ad account(s):${colors.reset}`);

    accounts.slice(0, 5).forEach((acc, idx) => {
      console.log(`   ${idx + 1}. ${acc.name} (${acc.id}) - Status: ${acc.account_status}`);
    });

    if (accounts.length > 5) {
      console.log(`   ... and ${accounts.length - 5} more`);
    }

    return true;
  } catch (error) {
    console.log(`${colors.red}❌ Meta API Error:${colors.reset}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`   ${error.message}`);
    }
    return false;
  }
}

async function testTikTokAccess() {
  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}  Testing TikTok Ads API Access${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);

  const token = process.env.TIKTOK_ACCESS_TOKEN;
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;

  if (!token) {
    console.log(`${colors.red}❌ TIKTOK_ACCESS_TOKEN not found in .env${colors.reset}`);
    return false;
  }

  if (!appId) {
    console.log(`${colors.red}❌ TIKTOK_APP_ID not found in .env${colors.reset}`);
    return false;
  }

  console.log(`${colors.yellow}🔑 Access Token: ${token.substring(0, 20)}...${colors.reset}`);
  console.log(`${colors.yellow}🆔 App ID: ${appId}${colors.reset}`);
  console.log(`${colors.yellow}🔐 App Secret: ${secret ? secret.substring(0, 10) + '...' : 'Not configured'}${colors.reset}`);

  try {
    console.log('\n📝 Test: Fetching advertiser accounts...');
    const response = await axios.get(
      'https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/',
      {
        headers: {
          'Access-Token': token,
          'Content-Type': 'application/json',
        },
        params: {
          app_id: appId,
          secret: secret, // Include secret if available
        },
      }
    );

    if (response.data.code !== 0) {
      console.log(`${colors.red}❌ TikTok API Error:${colors.reset}`);
      console.log(`   Code: ${response.data.code}`);
      console.log(`   Message: ${response.data.message}`);
      return false;
    }

    const accounts = response.data.data.list || [];
    console.log(`${colors.green}✅ Found ${accounts.length} advertiser account(s):${colors.reset}`);

    accounts.slice(0, 5).forEach((acc, idx) => {
      console.log(`   ${idx + 1}. ${acc.advertiser_name} (ID: ${acc.advertiser_id})`);
    });

    if (accounts.length > 5) {
      console.log(`   ... and ${accounts.length - 5} more`);
    }

    return true;
  } catch (error) {
    console.log(`${colors.red}❌ TikTok API Error:${colors.reset}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Message: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.log(`   ${error.message}`);
    }
    return false;
  }
}

async function main() {
  console.log(`\n${colors.blue}╔═══════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.blue}║  LaunchPro - API Credentials Diagnostic Tool         ║${colors.reset}`);
  console.log(`${colors.blue}╚═══════════════════════════════════════════════════════╝${colors.reset}`);

  const metaSuccess = await testMetaAccess();
  const tiktokSuccess = await testTikTokAccess();

  console.log(`\n${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.blue}  Summary${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`Meta API:   ${metaSuccess ? colors.green + '✅ Working' : colors.red + '❌ Failed'}${colors.reset}`);
  console.log(`TikTok API: ${tiktokSuccess ? colors.green + '✅ Working' : colors.red + '❌ Failed'}${colors.reset}`);

  if (!metaSuccess || !tiktokSuccess) {
    console.log(`\n${colors.yellow}💡 Troubleshooting Tips:${colors.reset}`);
    if (!metaSuccess) {
      console.log(`\n${colors.yellow}For Meta:${colors.reset}`);
      console.log('   1. Verify your token at: https://developers.facebook.com/tools/debug/accesstoken/');
      console.log('   2. Ensure token has these permissions: ads_management, ads_read, business_management');
      console.log('   3. Check if token has expired (use long-lived tokens)');
      console.log('   4. Verify you have access to Business Manager');
    }
    if (!tiktokSuccess) {
      console.log(`\n${colors.yellow}For TikTok:${colors.reset}`);
      console.log('   1. Verify your app is approved in TikTok For Business');
      console.log('   2. Check if access token has correct scope: Advertiser Management, Campaign Management');
      console.log('   3. Ensure app_id matches the app that generated the access token');
      console.log('   4. Try including the app_secret parameter in the request');
      console.log('   5. Check if you completed OAuth2 authentication correctly');
    }
  } else {
    console.log(`\n${colors.green}✅ All API credentials are working correctly!${colors.reset}`);
  }

  console.log('\n');
}

main().catch(console.error);
