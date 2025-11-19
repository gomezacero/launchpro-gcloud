/**
 * Test Script - Tonic Campaign Creation
 *
 * This script tests campaign creation directly with Tonic API
 * to see the exact response and identify the issue.
 *
 * Usage:
 *   node test-tonic-campaign-creation.js
 */

const axios = require('axios');

// CONFIGURATION - Replace with your actual values
const TONIC_CONSUMER_KEY = 'e9866aee9d040f1e983ecdfb2b83a0a394766ad266f59cd335ea44409abfa943';
const TONIC_CONSUMER_SECRET = '270bcd9d4b40eacb9c19cf7e0c4b96228b67427c18a86a6f12ffebbe6986dc8b';

// Test parameters (from your logs)
const TEST_PARAMS = {
  name: 'TonicTestingDirect',
  offer: 'Car Loans',
  offer_id: 800,  // Try as NUMBER
  country: 'CO',
  type: 'rsoc',
  return_type: 'id',
  headline_id: 725342217,  // Try as NUMBER
  domain: 'inktrekker.com',
  imprint: 'no'
};

async function testTonicCampaignCreation() {
  console.log('🚀 Starting Tonic API Campaign Creation Test...\n');

  try {
    // STEP 1: Authenticate
    console.log('📝 Step 1: Authenticating with Tonic...');
    const authResponse = await axios.post('https://api.publisher.tonic.com/jwt/authenticate', {
      consumer_key: TONIC_CONSUMER_KEY,
      consumer_secret: TONIC_CONSUMER_SECRET,
    });

    const token = authResponse.data.token;
    console.log('✅ Authentication successful!');
    console.log(`   Token: ${token.substring(0, 20)}...`);
    console.log(`   Expires: ${new Date(authResponse.data.expires * 1000).toISOString()}\n`);

    // STEP 2: Create campaign with headline_id as NUMBER
    console.log('📝 Step 2: Creating campaign (headline_id as NUMBER)...');
    console.log('   Parameters:', JSON.stringify(TEST_PARAMS, null, 2));

    try {
      const campaignResponse = await axios.post(
        'https://api.publisher.tonic.com/privileged/v3/campaign/create',
        TEST_PARAMS,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      console.log('\n✅ SUCCESS! Campaign created!');
      console.log('   Response Status:', campaignResponse.status);
      console.log('   Response Data:', campaignResponse.data);
      console.log('   Response Type:', typeof campaignResponse.data);
      console.log('   Campaign ID:', campaignResponse.data);

    } catch (error) {
      console.log('\n❌ FAILED with headline_id as NUMBER');
      console.log('   Error:', error.response?.data || error.message);
      console.log('   Status:', error.response?.status);
      console.log('   Status Text:', error.response?.statusText);

      // STEP 3: Try with headline_id as STRING
      console.log('\n📝 Step 3: Retrying with headline_id as STRING...');
      const TEST_PARAMS_STRING = {
        ...TEST_PARAMS,
        headline_id: TEST_PARAMS.headline_id.toString(),
      };
      console.log('   Parameters:', JSON.stringify(TEST_PARAMS_STRING, null, 2));

      try {
        const campaignResponse2 = await axios.post(
          'https://api.publisher.tonic.com/privileged/v3/campaign/create',
          TEST_PARAMS_STRING,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        console.log('\n✅ SUCCESS! Campaign created with STRING headline_id!');
        console.log('   Response Status:', campaignResponse2.status);
        console.log('   Response Data:', campaignResponse2.data);
        console.log('   Campaign ID:', campaignResponse2.data);

      } catch (error2) {
        console.log('\n❌ FAILED with headline_id as STRING too');
        console.log('   Error:', error2.response?.data || error2.message);
        console.log('   Status:', error2.response?.status);
        console.log('   Status Text:', error2.response?.statusText);
      }
    }

    // STEP 4: Try without headline_id (to isolate the issue)
    console.log('\n📝 Step 4: Testing without headline_id (Display campaign)...');
    const TEST_PARAMS_DISPLAY = {
      name: 'TonicTestingDisplay',
      offer: 'Car Loans',
      offer_id: 800,
      country: 'CO',
      type: 'display',
      return_type: 'id',
      imprint: 'no'
    };
    console.log('   Parameters:', JSON.stringify(TEST_PARAMS_DISPLAY, null, 2));

    try {
      const displayResponse = await axios.post(
        'https://api.publisher.tonic.com/privileged/v3/campaign/create',
        TEST_PARAMS_DISPLAY,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      console.log('\n✅ Display campaign works!');
      console.log('   This means RSOC-specific issue (headline_id or domain)');
      console.log('   Campaign ID:', displayResponse.data);

      // STEP 5: If Display works, try RSOC without domain
      console.log('\n📝 Step 5: Testing RSOC WITHOUT domain parameter...');
      const TEST_PARAMS_NO_DOMAIN = {
        name: 'TonicTestingNoDomain',
        offer: 'Car Loans',
        offer_id: 800,
        country: 'CO',
        type: 'rsoc',
        return_type: 'id',
        headline_id: 725342217,
        imprint: 'no'
        // NO domain parameter
      };
      console.log('   Parameters:', JSON.stringify(TEST_PARAMS_NO_DOMAIN, null, 2));

      try {
        const noDomainResponse = await axios.post(
          'https://api.publisher.tonic.com/privileged/v3/campaign/create',
          TEST_PARAMS_NO_DOMAIN,
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }
        );

        console.log('\n✅ SUCCESS without domain! The domain was the problem!');
        console.log('   Campaign ID:', noDomainResponse.data);

      } catch (error4) {
        console.log('\n❌ Still fails without domain');
        console.log('   Error:', error4.response?.data || error4.message);

        // STEP 6: Try RSOC with only required minimal params
        console.log('\n📝 Step 6: Testing RSOC with MINIMAL parameters...');
        const TEST_PARAMS_MINIMAL = {
          name: 'TonicTestingMinimal',
          offer_id: 800,
          country: 'CO',
          type: 'rsoc',
          headline_id: 725342217,
        };
        console.log('   Parameters:', JSON.stringify(TEST_PARAMS_MINIMAL, null, 2));

        try {
          const minimalResponse = await axios.post(
            'https://api.publisher.tonic.com/privileged/v3/campaign/create',
            TEST_PARAMS_MINIMAL,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            }
          );

          console.log('\n✅ SUCCESS with minimal params!');
          console.log('   Campaign ID:', minimalResponse.data);
          console.log('   The problem was an EXTRA parameter!');

        } catch (error5) {
          console.log('\n❌ Minimal params also fail');
          console.log('   Error:', error5.response?.data || error5.message);
          console.log('\n🔍 The headline_id might not belong to this account or is not usable');
        }
      }

    } catch (error3) {
      console.log('\n❌ Display campaign also fails');
      console.log('   This means account permission issue');
      console.log('   Error:', error3.response?.data || error3.message);
    }

  } catch (error) {
    console.error('\n💥 Authentication failed:', error.message);
    console.error('   Make sure to replace TONIC_CONSUMER_KEY and TONIC_CONSUMER_SECRET');
  }
}

// RUN THE TEST
testTonicCampaignCreation();
