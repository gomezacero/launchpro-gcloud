
const axios = require('axios');
const dotenv = require('dotenv');
const FormData = require('form-data');
const fs = require('fs');

dotenv.config();

async function debugTikTok() {
    const token = process.env.TIKTOK_ACCESS_TOKEN;
    const advertiserId = process.env.TIKTOK_ADVERTISER_ID;

    console.log('--- TikTok Token Debug ---');
    console.log(`Token configured: ${token ? token.substring(0, 10) + '...' : 'MISSING'}`);
    console.log(`Advertiser ID: ${advertiserId}`);

    if (!token) {
        console.error('❌ No TIKTOK_ACCESS_TOKEN found in environment.');
        return;
    }

    // Try v1.2
    const client = axios.create({
        baseURL: 'https://business-api.tiktok.com/open_api/v1.2/',
        headers: {
            'Access-Token': token,
            'Content-Type': 'application/json',
        },
    });

    try {
        console.log('\n1. Testing User Info...');
        const userResponse = await client.get('/user/info/');
        console.log('✅ User Info Success:', JSON.stringify(userResponse.data, null, 2));
    } catch (error) {
        console.error('❌ User Info Failed:', error.response?.data || error.message);
    }

    try {
        console.log('\n2. Testing Image Upload (URL) with v1.2...');
        const imageUrl = 'https://via.placeholder.com/150.png';
        const response = await client.post('/file/image/ad/upload/', {
            advertiser_id: advertiserId,
            upload_type: 'UPLOAD_BY_URL',
            image_url: imageUrl,
        });
        console.log('✅ Image Upload Success:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Image Upload Failed:', error.response?.data || error.message);
    }
}

debugTikTok();
