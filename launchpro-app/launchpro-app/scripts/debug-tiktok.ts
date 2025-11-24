
import { tiktokService } from '../services/tiktok.service';
import * as dotenv from 'dotenv';

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

    // tiktokService is already exported as a singleton, no need to instantiate

    try {
        console.log('\n1. Testing User Info...');
        // Manually call user info endpoint
        // Note: TikTokService might not have a method for this, so we use the client or axios directly if needed.
        // But let's try to use the service if possible, or just use the client.
        const client = tiktokService['client']; // Access private client
        const userResponse = await client.get('/user/info/');
        console.log('✅ User Info Success:', JSON.stringify(userResponse.data, null, 2));
    } catch (error: any) {
        console.error('❌ User Info Failed:', error.response?.data || error.message);
    }

    try {
        console.log('\n2. Testing Image Upload (URL)...');
        // Use a dummy image URL
        const imageUrl = 'https://via.placeholder.com/150.png';
        const uploadResult = await tiktokService.uploadImage(imageUrl, 'debug-test.png', 'UPLOAD_BY_URL');
        console.log('✅ Image Upload Success:', uploadResult);
    } catch (error: any) {
        console.error('❌ Image Upload Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

debugTikTok();
