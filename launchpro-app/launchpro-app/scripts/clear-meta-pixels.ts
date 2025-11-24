import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { prisma } from '../lib/prisma';

async function main() {
  console.log('Clearing Meta pixel IDs...');
  const result = await prisma.account.updateMany({
    where: { accountType: 'META' },
    data: { metaPixelId: null }
  });
  console.log(`✅ Cleared ${result.count} Meta pixel IDs`);
  await prisma.$disconnect();
}

main();
