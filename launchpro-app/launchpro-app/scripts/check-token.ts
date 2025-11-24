import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../lib/prisma';

async function main() {
  const settings = await prisma.globalSettings.findUnique({
    where: { id: 'global-settings' }
  });

  console.log('Current TikTok Token in DB:', settings?.tiktokAccessToken);
  console.log('Token from .env:', process.env.TIKTOK_ACCESS_TOKEN);

  await prisma.$disconnect();
}

main();
