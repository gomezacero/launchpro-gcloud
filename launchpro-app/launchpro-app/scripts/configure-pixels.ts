import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../lib/prisma';

/**
 * QUICK PIXEL CONFIGURATION SCRIPT
 *
 * This script configures pixel IDs for all accounts.
 * Since the TikTok token doesn't have permission to list pixels,
 * we'll set them manually.
 */

async function main() {
  console.log('\n🔧 Configuring Pixel IDs for all accounts...\n');

  // CONFIGURE THESE VALUES:
  const TIKTOK_PIXEL_ID = process.env.TIKTOK_PIXEL_ID || 'CQJHGLRC77UFVG7H4QJG'; // Default from .env
  const META_PIXEL_ID = process.env.META_PIXEL_ID || ''; // Set this if you have a default Meta pixel

  console.log(`TikTok Pixel ID: ${TIKTOK_PIXEL_ID || 'NOT SET'}`);
  console.log(`Meta Pixel ID: ${META_PIXEL_ID || 'NOT SET'}\n`);

  // Update all TikTok accounts
  if (TIKTOK_PIXEL_ID) {
    console.log('📱 Updating TikTok accounts...');
    const tiktokResult = await prisma.account.updateMany({
      where: { accountType: 'TIKTOK' },
      data: { tiktokPixelId: TIKTOK_PIXEL_ID }
    });
    console.log(`   ✅ Updated ${tiktokResult.count} TikTok account(s)\n`);
  } else {
    console.log('⏭️  Skipping TikTok (no pixel ID provided)\n');
  }

  // Update all Meta accounts
  if (META_PIXEL_ID) {
    console.log('📘 Updating Meta accounts...');
    const metaResult = await prisma.account.updateMany({
      where: { accountType: 'META' },
      data: { metaPixelId: META_PIXEL_ID }
    });
    console.log(`   ✅ Updated ${metaResult.count} Meta account(s)\n`);
  } else {
    console.log('⏭️  Skipping Meta (no pixel ID provided)\n');
  }

  console.log('✅ Done!\n');
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
