import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env from parent directory (launchpro-app/)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { tiktokService } from '../services/tiktok.service';
import { prisma } from '@/lib/prisma';

/**
 * Script to fetch and populate TikTok pixel IDs for all TikTok accounts
 *
 * This script:
 * 1. Fetches all TikTok accounts from the database
 * 2. For each account, fetches available pixels from TikTok API
 * 3. Updates the database with the first pixel found
 */

async function fetchAndUpdatePixels() {
    console.log('🚀 Starting TikTok Pixel ID fetch and update process...\n');

    try {
        // Fetch all TikTok accounts from database
        const tiktokAccounts = await prisma.account.findMany({
            where: {
                accountType: 'TIKTOK',
            },
        });

        console.log(`📊 Found ${tiktokAccounts.length} TikTok account(s) in database\n`);

        if (tiktokAccounts.length === 0) {
            console.log('⚠️  No TikTok accounts found in database. Nothing to update.');
            return;
        }

        let updatedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;

        for (const account of tiktokAccounts) {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`📱 Processing: ${account.name}`);
            console.log(`   Advertiser ID: ${account.tiktokAdvertiserId || 'N/A'}`);
            console.log(`   Current Pixel ID: ${account.tiktokPixelId || 'Not configured'}`);

            // Skip if no advertiser ID
            if (!account.tiktokAdvertiserId) {
                console.log(`   ⚠️  SKIPPED: No advertiser ID configured`);
                skippedCount++;
                continue;
            }

            // Skip if pixel already configured
            if (account.tiktokPixelId) {
                console.log(`   ✅ SKIPPED: Pixel ID already configured`);
                skippedCount++;
                continue;
            }

            // Get access token with fallback to global settings
            let accessToken = account.tiktokAccessToken;

            if (!accessToken) {
                console.log(`   ⚠️  No account-specific token. Trying global settings...`);
                const globalSettings = await prisma.globalSettings.findUnique({
                    where: { id: 'global-settings' },
                });
                accessToken = globalSettings?.tiktokAccessToken;

                if (!accessToken) {
                    accessToken = process.env.TIKTOK_ACCESS_TOKEN;
                }

                if (accessToken) {
                    console.log(`   ✅ Using global TikTok access token`);
                } else {
                    console.log(`   ⚠️  SKIPPED: No access token found (account, global, or .env)`);
                    skippedCount++;
                    continue;
                }
            }

            try {
                console.log(`   🔍 Fetching pixels from TikTok API...`);

                // Use the new listPixels method from tiktokService
                const pixels = await tiktokService.listPixels(
                    account.tiktokAdvertiserId,
                    accessToken
                );

                if (pixels && pixels.length > 0) {
                    const firstPixel = pixels[0];
                    console.log(`   ✅ Found ${pixels.length} pixel(s)`);
                    console.log(`   📌 Using first pixel: ${firstPixel.pixel_id} (${firstPixel.pixel_name || 'No name'})`);

                    // Update database
                    await prisma.account.update({
                        where: { id: account.id },
                        data: { tiktokPixelId: firstPixel.pixel_id },
                    });

                    console.log(`   💾 Successfully updated database with pixel ID: ${firstPixel.pixel_id}`);
                    updatedCount++;
                } else {
                    console.log(`   ⚠️  No pixels found for this account`);
                    console.log(`   💡 Create a pixel in TikTok Ads Manager for advertiser ${account.tiktokAdvertiserId}`);
                    skippedCount++;
                }
            } catch (error: any) {
                console.log(`   ❌ ERROR: Failed to fetch pixels - ${error.message}`);
                if (error.response?.data) {
                    console.log(`   Response:`, JSON.stringify(error.response.data, null, 2));
                }
                errorCount++;
            }
        }

        // Summary
        console.log(`\n${'='.repeat(60)}`);
        console.log('\n📊 SUMMARY:');
        console.log(`   Total accounts: ${tiktokAccounts.length}`);
        console.log(`   ✅ Updated: ${updatedCount}`);
        console.log(`   ⏭️  Skipped: ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);
        console.log('');

        if (updatedCount > 0) {
            console.log('🎉 Success! Pixel IDs have been populated for TikTok accounts.');
        } else {
            console.log('ℹ️  No accounts were updated. Check the logs above for details.');
        }

    } catch (error: any) {
        console.error('\n❌ FATAL ERROR:', error.message);
        console.error(error.stack);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the script
fetchAndUpdatePixels();
