/**
 * Get article request details from Tonic
 */

import { prisma } from '../lib/prisma';
import { tonicService } from '../services/tonic.service';

async function main() {
  const campaign = await prisma.campaign.findUnique({
    where: { id: 'cmjxh9wwf0001l404e4nvlket' },
    include: {
      platforms: {
        where: { platform: 'TONIC' },
        include: { tonicAccount: true },
      },
    },
  });

  if (!campaign) {
    console.error('Campaign not found');
    return;
  }

  console.log(`\n📋 Campaign: ${campaign.name}`);
  console.log(`   Article Request ID: ${campaign.tonicArticleRequestId}`);
  console.log(`   Article/Headline ID: ${campaign.tonicArticleId}`);

  const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
  const tonicAccount = tonicPlatform?.tonicAccount;

  if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
    console.error('No Tonic credentials found');
    return;
  }

  const credentials = {
    consumer_key: tonicAccount.tonicConsumerKey,
    consumer_secret: tonicAccount.tonicConsumerSecret,
  };

  // Get article request details
  if (campaign.tonicArticleRequestId) {
    console.log(`\n🔍 Fetching article request details...\n`);
    const articleRequest = await tonicService.getArticleRequest(
      credentials,
      parseInt(campaign.tonicArticleRequestId)
    );
    console.log('Article Request:', JSON.stringify(articleRequest, null, 2));
  }

  // Get campaign status
  if (campaign.tonicCampaignId) {
    console.log(`\n🔍 Fetching campaign status...\n`);
    const campaignStatus = await tonicService.getCampaignStatus(
      credentials,
      campaign.tonicCampaignId
    );
    console.log('Campaign Status:', JSON.stringify(campaignStatus, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
