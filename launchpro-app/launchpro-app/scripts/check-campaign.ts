import { prisma } from '../lib/prisma';

async function main() {
  const campaign = await prisma.campaign.findUnique({
    where: { id: 'cmjxh9wwf0001l404e4nvlket' },
    select: {
      name: true,
      tonicCampaignId: true,
      tonicArticleId: true,
      tonicArticleRequestId: true,
      tonicTrackingLink: true,
      tonicDirectLink: true,
    }
  });
  console.log('Campaign data:', JSON.stringify(campaign, null, 2));
  await prisma.$disconnect();
}

main();
