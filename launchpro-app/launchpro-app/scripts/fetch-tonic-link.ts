/**
 * Script to fetch tracking link from Tonic for a specific campaign
 * Usage: npx tsx scripts/fetch-tonic-link.ts <campaignId>
 */

import { prisma } from '../lib/prisma';
import { tonicService } from '../services/tonic.service';

async function fetchTonicLink(launchProCampaignId: string) {
  console.log(`\n🔍 Fetching Tonic link for campaign: ${launchProCampaignId}\n`);

  // Get campaign with Tonic account
  const campaign = await prisma.campaign.findUnique({
    where: { id: launchProCampaignId },
    include: {
      platforms: {
        where: { platform: 'TONIC' },
        include: { tonicAccount: true },
      },
    },
  });

  if (!campaign) {
    console.error('❌ Campaign not found');
    return;
  }

  console.log(`📋 Campaign: ${campaign.name}`);
  console.log(`   Tonic Campaign ID: ${campaign.tonicCampaignId}`);
  console.log(`   Current Tracking Link: ${campaign.tonicTrackingLink || 'Not set'}`);

  if (!campaign.tonicCampaignId) {
    console.error('❌ Campaign does not have a Tonic Campaign ID');
    return;
  }

  const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
  const tonicAccount = tonicPlatform?.tonicAccount;

  if (!tonicAccount?.tonicConsumerKey || !tonicAccount?.tonicConsumerSecret) {
    console.error('❌ No Tonic credentials found');
    return;
  }

  const credentials = {
    consumer_key: tonicAccount.tonicConsumerKey,
    consumer_secret: tonicAccount.tonicConsumerSecret,
  };

  console.log(`\n🔄 Searching in Tonic...\n`);

  // Try multiple states
  const statesToCheck = ['active', 'pending', 'incomplete', 'stopped'] as const;
  let tonicCampaign: any = null;

  for (const state of statesToCheck) {
    try {
      console.log(`   Checking '${state}' campaigns...`);
      const campaignList = await tonicService.getCampaignList(credentials, state);
      const found = campaignList.find((c: any) =>
        String(c.id) === String(campaign.tonicCampaignId)
      );
      if (found) {
        console.log(`   ✅ Found in '${state}'!`);
        tonicCampaign = found;
        break;
      }
    } catch (err) {
      console.log(`   ⚠️ Error fetching ${state}: ${err}`);
    }
  }

  if (!tonicCampaign) {
    // Try status endpoint
    try {
      console.log(`\n   Trying status endpoint...`);
      const status = await tonicService.getCampaignStatus(credentials, campaign.tonicCampaignId);
      console.log(`   Status response:`, JSON.stringify(status, null, 2));
      tonicCampaign = status;
    } catch (err) {
      console.log(`   ⚠️ Status endpoint failed: ${err}`);
    }
  }

  if (tonicCampaign) {
    console.log(`\n📦 Tonic Campaign Data:`);
    console.log(JSON.stringify(tonicCampaign, null, 2));

    const trackingLink = tonicCampaign.link || tonicCampaign.tracking_link || null;
    const directLink = tonicCampaign.direct_link || null;

    console.log(`\n🔗 Links found:`);
    console.log(`   Tracking Link: ${trackingLink || 'Not available'}`);
    console.log(`   Direct Link: ${directLink || 'Not available'}`);

    if (trackingLink || directLink) {
      console.log(`\n💾 Updating campaign in database...`);
      await prisma.campaign.update({
        where: { id: launchProCampaignId },
        data: {
          tonicTrackingLink: trackingLink,
          tonicDirectLink: directLink,
        },
      });
      console.log(`   ✅ Campaign updated!`);
    }
  } else {
    console.log(`\n❌ Campaign not found in Tonic`);
  }

  await prisma.$disconnect();
}

// Get campaign ID from command line
const campaignId = process.argv[2];
if (!campaignId) {
  console.log('Usage: npx tsx scripts/fetch-tonic-link.ts <campaignId>');
  console.log('Example: npx tsx scripts/fetch-tonic-link.ts cmjxh9wwf0001l404e4nvlket');
  process.exit(1);
}

fetchTonicLink(campaignId).catch(console.error);
