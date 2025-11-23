
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function debugTikTokIdentities() {
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    const advertiserId = process.env.TIKTOK_ADVERTISER_ID;

    console.log('--- TikTok Identity Debug ---');
    console.log(`Advertiser ID: ${advertiserId}`);

    if (!token) {
        console.error('❌ No TIKTOK_ACCESS_TOKEN found.');
        return;
    }

    const client = axios.create({
        baseURL: 'https://business-api.tiktok.com/open_api/v1.3/',
        headers: {
            'Access-Token': token,
            'Content-Type': 'application/json',
        },
    });

    try {
        console.log('\nFetching Identities...');
        const response = await client.get('/identity/get/', {
            params: {
                advertiser_id: advertiserId,
                page: 1,
                page_size: 20,
            },
        });
        console.log('✅ Identities Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Failed to fetch identities:', error.response?.data || error.message);
    }
}

debugTikTokIdentities();
