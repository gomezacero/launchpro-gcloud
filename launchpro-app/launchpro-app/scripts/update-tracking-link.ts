import { prisma } from '../lib/prisma';

async function main() {
  const trackingLink = 'https://48srtn.bmzdkwccpmx.com';

  const updated = await prisma.campaign.update({
    where: { id: 'cmjxh9wwf0001l404e4nvlket' },
    data: {
      tonicTrackingLink: trackingLink,
    },
  });

  console.log(`✅ Updated campaign "${updated.name}" with tracking link: ${trackingLink}`);
  await prisma.$disconnect();
}

main().catch(console.error);
