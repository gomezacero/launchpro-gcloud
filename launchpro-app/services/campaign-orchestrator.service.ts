import { prisma } from '@/lib/prisma';
import { tonicService, TonicService } from './tonic.service';
import { metaService, MetaService } from './meta.service';
import { tiktokService, TikTokService } from './tiktok.service';
import { aiService } from './ai.service';
import { CampaignStatus, Platform, CampaignType, MediaType } from '@prisma/client';

/**
 * Campaign Orchestrator Service
 *
 * This is the MASTER service that coordinates the entire campaign launch workflow:
 *
 * WORKFLOW:
 * 1. Create campaign in database (DRAFT)
 * 2. Create campaign in Tonic → get tracking link
 * 3. Generate AI content (GENERATING_AI):
 *    - Copy Master (if not provided)
 *    - Keywords
 *    - Article (for RSOC)
 *    - Ad Copy
 *    - Images (if enabled)
 *    - Videos (if enabled)
 * 4. Set keywords in Tonic
 * 5. Launch to platforms (META/TIKTOK) (LAUNCHING):
 *    - Create Campaign
 *    - Create Ad Set/Ad Group
 *    - Upload media
 *    - Create ad creative
 *    - Create ad
 * 6. Configure pixels/tracking
 * 7. Update status to ACTIVE
 */

export interface CreateCampaignParams {
  // Basic Info
  name: string;
  campaignType: CampaignType; // CBO or ABO

  // Account Selection
  provider: 'META' | 'TIKTOK';
  addAccountId: string; // Meta or TikTok account ID
  tonicAccountId: string; // Tonic account ID

  // Offer Info (from Tonic)
  offerId: string;

  // Location & Language
  country: string;
  language: string;

  // Optional Copy Master (will be AI-generated if not provided)
  copyMaster?: string;
  communicationAngle?: string;

  // Platforms to launch on
  platforms: {
    platform: Platform;
    performanceGoal?: string;
    budget: number; // in dollars
    startDate: Date;
    generateWithAI: boolean; // Generate images/videos with AI?
    fanPage?: string; // Meta Fan Page ID
    pixel?: string; // Pixel ID (Meta or TikTok)
    instagramPage?: string; // Instagram Page ID
    tiktokPage?: string; // TikTok Page ID
  }[];

  // Manual keywords (optional, will be AI-generated if not provided)
  keywords?: string[];
}

export interface LaunchResult {
  success: boolean;
  campaignId: string;
  tonicCampaignId?: string;
  tonicTrackingLink?: string;
  platforms: {
    platform: Platform;
    success: boolean;
    campaignId?: string;
    adSetId?: string;
    adId?: string;
    error?: string;
  }[];
  aiContent?: {
    copyMaster: string;
    keywords: string[];
    article?: any;
    adCopy?: any;
    media?: {
      images: string[];
      videos: string[];
    };
  };
  errors?: string[];
}

class CampaignOrchestratorService {
  /**
   * MAIN METHOD: Launch a complete campaign
   */
  async launchCampaign(params: CreateCampaignParams): Promise<LaunchResult> {
    const errors: string[] = [];
    let campaign: any;

    try {
      console.log('🚀 Starting campaign launch workflow...');

      // ============================================
      // STEP 1: Get offer details from Tonic
      // ============================================
      console.log('📦 Fetching offer details...');
      const offers = await tonicService.getOffers();
      const offer = offers.find((o: any) => o.id === params.offerId);

      if (!offer) {
        throw new Error(`Offer with ID ${params.offerId} not found`);
      }

      // Create or get offer in database
      let dbOffer = await prisma.offer.findUnique({
        where: { tonicId: params.offerId },
      });

      if (!dbOffer) {
        dbOffer = await prisma.offer.create({
          data: {
            tonicId: params.offerId,
            name: offer.name,
            vertical: offer.vertical || 'Unknown',
          },
        });
      }

      // ============================================
      // STEP 2: Create campaign in database
      // ============================================
      console.log('💾 Creating campaign in database...');
      console.log('📋 Account IDs:', {
        provider: params.provider,
        addAccountId: params.addAccountId,
        tonicAccountId: params.tonicAccountId,
      });

      campaign = await prisma.campaign.create({
        data: {
          name: params.name,
          status: CampaignStatus.DRAFT,
          campaignType: params.campaignType,
          offerId: dbOffer.id,
          country: params.country,
          language: params.language,
          copyMaster: params.copyMaster,
          communicationAngle: params.communicationAngle,
          keywords: params.keywords || [],
          platforms: {
            create: params.platforms.map((p) => ({
              platform: p.platform,
              performanceGoal: p.performanceGoal,
              pixelId: p.pixel,
              destinationPage: p.platform === 'META' ? p.fanPage : p.tiktokPage,
              budget: p.budget,
              startDate: p.startDate,
              generateWithAI: p.generateWithAI,
              status: CampaignStatus.DRAFT,
              // Set account IDs based on platform
              tonicAccountId: params.tonicAccountId,
              metaAccountId: p.platform === 'META' ? params.addAccountId : null,
              tiktokAccountId: p.platform === 'TIKTOK' ? params.addAccountId : null,
            })),
          },
        },
        include: {
          platforms: true,
          offer: true,
        },
      });

      console.log(`✅ Campaign created with ID: ${campaign.id}`);

      // ============================================
      // STEP 3: Get Tonic account credentials and create campaign
      // ============================================
      console.log('🎯 Creating campaign in Tonic...');

      // Get Tonic account credentials from database
      const tonicAccount = await prisma.account.findUnique({
        where: { id: params.tonicAccountId },
      });

      if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
        throw new Error(`Tonic account ${params.tonicAccountId} not found or missing credentials`);
      }

      // Create Tonic service instance with account-specific credentials
      const accountTonicService = TonicService.withCredentials({
        consumer_key: tonicAccount.tonicConsumerKey,
        consumer_secret: tonicAccount.tonicConsumerSecret,
      });

      const tonicCampaignId = await accountTonicService.createCampaign({
        name: params.name,
        offer_id: params.offerId,
        country: params.country,
        type: 'display', // or 'rsoc' based on requirements
        return_type: 'id',
      });

      console.log(`✅ Tonic campaign created with ID: ${tonicCampaignId}`);

      // Get campaign status to get tracking link
      const tonicStatus = await accountTonicService.getCampaignStatus(tonicCampaignId.toString());
      const trackingLink = tonicStatus[0]?.link;

      // Update campaign with Tonic info
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          tonicCampaignId: tonicCampaignId.toString(),
          tonicTrackingLink: trackingLink,
        },
      });

      // ============================================
      // STEP 4: Generate AI Content
      // ============================================
      console.log('🤖 Generating AI content...');
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.GENERATING_AI },
      });

      const aiContentResult: any = {};

      // 4a. Generate Copy Master if not provided
      if (!params.copyMaster) {
        console.log('  📝 Generating Copy Master...');
        aiContentResult.copyMaster = await aiService.generateCopyMaster({
          offerName: offer.name,
          offerDescription: offer.description,
          vertical: offer.vertical,
          country: params.country,
          language: params.language,
        });

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { copyMaster: aiContentResult.copyMaster },
        });
      } else {
        aiContentResult.copyMaster = params.copyMaster;
      }

      // 4b. Generate Keywords if not provided
      if (!params.keywords || params.keywords.length === 0) {
        console.log('  🔑 Generating Keywords...');
        aiContentResult.keywords = await aiService.generateKeywords({
          offerName: offer.name,
          copyMaster: aiContentResult.copyMaster,
          count: 6,
          country: params.country,
        });

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { keywords: aiContentResult.keywords },
        });
      } else {
        aiContentResult.keywords = params.keywords;
      }

      // 4c. Set keywords in Tonic
      console.log('  🎯 Setting keywords in Tonic...');
      await accountTonicService.setKeywords({
        campaign_id: parseInt(tonicCampaignId.toString()),
        keywords: aiContentResult.keywords,
        keyword_amount: aiContentResult.keywords.length,
      });

      // 4d. Generate Article for RSOC (if needed)
      console.log('  📰 Generating Article...');
      aiContentResult.article = await aiService.generateArticle({
        offerName: offer.name,
        copyMaster: aiContentResult.copyMaster,
        keywords: aiContentResult.keywords,
        country: params.country,
        language: params.language,
      });

      // Create article in Tonic RSOC
      const articleRequestId = await accountTonicService.createArticleRequest({
        offer_id: parseInt(params.offerId),
        country: params.country,
        language: params.language,
        domain: 'publisher.tonic.com', // Get from config or user input
        content_generation_phrases: aiContentResult.article.contentGenerationPhrases,
        headline: aiContentResult.article.headline,
        teaser: aiContentResult.article.teaser,
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { tonicArticleId: articleRequestId.toString() },
      });

      // ============================================
      // STEP 5: Generate Media (Images/Videos) for each platform
      // ============================================
      aiContentResult.media = {
        images: [],
        videos: [],
      };

      for (const platformConfig of params.platforms) {
        if (!platformConfig.generateWithAI) {
          console.log(`  ⏭️  Skipping AI media generation for ${platformConfig.platform}`);
          continue;
        }

        console.log(`  🎨 Generating media for ${platformConfig.platform}...`);

        // Generate Ad Copy specific to platform
        const adCopy = await aiService.generateAdCopy({
          offerName: offer.name,
          copyMaster: aiContentResult.copyMaster,
          platform: platformConfig.platform,
          adFormat: 'IMAGE', // or VIDEO based on config
        });

        // Generate Image
        console.log(`    🖼️  Generating image...`);
        const imagePrompt = `${adCopy.headline}. ${adCopy.primaryText}. Professional advertising image for ${offer.name}. High quality, eye-catching, ${platformConfig.platform} ad style.`;

        const image = await aiService.generateImage({
          prompt: imagePrompt,
          aspectRatio: platformConfig.platform === 'TIKTOK' ? '9:16' : '1:1',
        });

        await prisma.media.create({
          data: {
            campaignId: campaign.id,
            type: MediaType.IMAGE,
            generatedByAI: true,
            aiModel: 'imagen-4.0-fast-generate-001',
            aiPrompt: imagePrompt,
            url: image.imageUrl,
            gcsPath: image.gcsPath,
            fileName: image.gcsPath.split('/').pop() || 'image.png',
            mimeType: 'image/png',
          },
        });

        aiContentResult.media.images.push(image.imageUrl);

        // Generate Video (optional, can be CPU/time intensive)
        if (platformConfig.platform === 'TIKTOK' || platformConfig.platform === 'META') {
          console.log(`    🎥 Generating video...`);
          const videoPrompt = `${adCopy.headline}. Professional advertising video for ${offer.name}. Dynamic, engaging, ${platformConfig.platform} style.`;

          const video = await aiService.generateVideo({
            prompt: videoPrompt,
            durationSeconds: 5,
            aspectRatio: platformConfig.platform === 'TIKTOK' ? '9:16' : '16:9',
          });

          await prisma.media.create({
            data: {
              campaignId: campaign.id,
              type: MediaType.VIDEO,
              generatedByAI: true,
              aiModel: 'veo-3.1-fast',
              aiPrompt: videoPrompt,
              url: video.videoUrl,
              gcsPath: video.gcsPath,
              fileName: video.gcsPath.split('/').pop() || 'video.mp4',
              mimeType: 'video/mp4',
              duration: 5,
            },
          });

          aiContentResult.media.videos.push(video.videoUrl);
        }
      }

      console.log('✅ AI content generation complete!');

      // Update status to ready to launch
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.READY_TO_LAUNCH },
      });

      // ============================================
      // STEP 6: Launch to platforms (Meta/TikTok)
      // ============================================
      console.log('🚀 Launching to platforms...');
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.LAUNCHING },
      });

      const platformResults = [];

      for (const platformConfig of params.platforms) {
        try {
          console.log(`  📱 Launching to ${platformConfig.platform}...`);

          if (platformConfig.platform === Platform.META) {
            const result = await this.launchToMeta(campaign, platformConfig, aiContentResult);
            platformResults.push(result);
          } else if (platformConfig.platform === Platform.TIKTOK) {
            const result = await this.launchToTikTok(
              campaign,
              platformConfig,
              aiContentResult
            );
            platformResults.push(result);
          }
        } catch (error: any) {
          console.error(`  ❌ Error launching to ${platformConfig.platform}:`, error);
          errors.push(`${platformConfig.platform}: ${error.message}`);
          platformResults.push({
            platform: platformConfig.platform,
            success: false,
            error: error.message,
          });
        }
      }

      // ============================================
      // STEP 7: Configure Pixels
      // ============================================
      console.log('📊 Configuring tracking pixels...');
      for (const platformConfig of params.platforms) {
        try {
          if (platformConfig.platform === Platform.META) {
            await accountTonicService.createPixel('facebook', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              source: 'facebook',
              event_name: 'Lead',
              send_revenue: 'yes',
              revenue_type: 'preestimated_revenue',
            });
          } else if (platformConfig.platform === Platform.TIKTOK) {
            await accountTonicService.createPixel('tiktok', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              source: 'tiktok',
              send_revenue: 'yes',
              revenue_type: 'preestimated_revenue',
            });
          }
        } catch (error: any) {
          console.warn(`  ⚠️  Warning: Could not configure pixel for ${platformConfig.platform}`);
          errors.push(`Pixel configuration for ${platformConfig.platform}: ${error.message}`);
        }
      }

      // ============================================
      // STEP 8: Mark as ACTIVE
      // ============================================
      const allSuccessful = platformResults.every((r) => r.success);

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: allSuccessful ? CampaignStatus.ACTIVE : CampaignStatus.FAILED,
          launchedAt: new Date(),
        },
      });

      console.log('🎉 Campaign launch complete!');

      return {
        success: allSuccessful,
        campaignId: campaign.id,
        tonicCampaignId: tonicCampaignId.toString(),
        tonicTrackingLink: trackingLink,
        platforms: platformResults,
        aiContent: aiContentResult,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      console.error('❌ Campaign launch failed:', error);

      if (campaign) {
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.FAILED },
        });
      }

      throw error;
    }
  }

  /**
   * Launch campaign to Meta (Facebook/Instagram)
   */
  private async launchToMeta(campaign: any, platformConfig: any, aiContent: any) {
    console.log('    📘 Creating Meta campaign...');

    // Get Meta account ID from campaign platform
    const campaignPlatform = await prisma.campaignPlatform.findUnique({
      where: {
        campaignId_platform: {
          campaignId: campaign.id,
          platform: Platform.META,
        },
      },
      include: {
        metaAccount: true,
      },
    });

    if (!campaignPlatform || !campaignPlatform.metaAccountId) {
      throw new Error('Meta account not found for campaign');
    }

    // Get Meta account ad account ID
    const metaAccount = await prisma.account.findUnique({
      where: { id: campaignPlatform.metaAccountId },
    });

    if (!metaAccount || !metaAccount.metaAdAccountId) {
      throw new Error('Meta ad account ID not found');
    }

    // Create Meta service instance with specific account
    const accountMetaService = MetaService.withAccount(metaAccount.metaAdAccountId);

    // Generate ad copy specific to Meta
    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'META',
      adFormat: 'IMAGE',
    });

    // Create Campaign
    const metaCampaign = await accountMetaService.createCampaign({
      name: campaign.name,
      objective: 'OUTCOME_LEADS',
      status: 'PAUSED',
    });

    // Create Ad Set
    const adSet = await accountMetaService.createAdSet({
      campaign_id: metaCampaign.id,
      name: `${campaign.name} - AdSet`,
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'IMPRESSIONS',
      daily_budget: platformConfig.budget * 100, // Convert to cents
      start_time: platformConfig.startDate.toISOString(),
      status: 'PAUSED',
    });

    // Upload media
    const media = await prisma.media.findFirst({
      where: {
        campaignId: campaign.id,
        type: MediaType.IMAGE,
      },
    });

    let imageHash: string | undefined;
    if (media) {
      // Download image and upload to Meta
      const axios = require('axios');
      const response = await axios.get(media.url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);
      imageHash = await accountMetaService.uploadImage(imageBuffer, media.fileName);
    }

    // Create Ad Creative
    const creative = await accountMetaService.createAdCreative({
      name: `${campaign.name} - Creative`,
      object_story_spec: {
        page_id: 'YOUR_PAGE_ID', // Get from config
        link_data: {
          link: campaign.tonicTrackingLink || 'https://example.com',
          message: adCopy.primaryText,
          name: adCopy.headline,
          description: adCopy.description,
          image_hash: imageHash,
          call_to_action: {
            type: adCopy.callToAction,
          },
        },
      },
    });

    // Create Ad
    const ad = await accountMetaService.createAd({
      name: `${campaign.name} - Ad`,
      adset_id: adSet.id,
      creative: {
        creative_id: creative.id,
      },
      status: 'PAUSED',
    });

    // Update database
    await prisma.campaignPlatform.update({
      where: {
        campaignId_platform: {
          campaignId: campaign.id,
          platform: Platform.META,
        },
      },
      data: {
        metaCampaignId: metaCampaign.id,
        metaAdSetId: adSet.id,
        metaAdId: ad.id,
        status: CampaignStatus.ACTIVE,
      },
    });

    return {
      platform: Platform.META,
      success: true,
      campaignId: metaCampaign.id,
      adSetId: adSet.id,
      adId: ad.id,
    };
  }

  /**
   * Launch campaign to TikTok
   */
  private async launchToTikTok(campaign: any, platformConfig: any, aiContent: any) {
    console.log('    🎵 Creating TikTok campaign...');

    // Get TikTok account ID from campaign platform
    const campaignPlatform = await prisma.campaignPlatform.findUnique({
      where: {
        campaignId_platform: {
          campaignId: campaign.id,
          platform: Platform.TIKTOK,
        },
      },
      include: {
        tiktokAccount: true,
      },
    });

    if (!campaignPlatform || !campaignPlatform.tiktokAccountId) {
      throw new Error('TikTok account not found for campaign');
    }

    // Get TikTok account advertiser ID
    const tiktokAccount = await prisma.account.findUnique({
      where: { id: campaignPlatform.tiktokAccountId },
    });

    if (!tiktokAccount || !tiktokAccount.tiktokAdvertiserId) {
      throw new Error('TikTok advertiser ID not found');
    }

    // Create TikTok service instance with specific account
    const accountTikTokService = TikTokService.withAccount(tiktokAccount.tiktokAdvertiserId);

    // Generate ad copy specific to TikTok
    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
      adFormat: 'VIDEO',
    });

    // Create Campaign
    const tiktokCampaign = await accountTikTokService.createCampaign({
      advertiser_id: tiktokAccount.tiktokAdvertiserId,
      campaign_name: campaign.name,
      objective_type: 'LEAD_GENERATION',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: platformConfig.budget * 100, // Convert to cents
    });

    // Create Ad Group
    const adGroup = await accountTikTokService.createAdGroup({
      advertiser_id: tiktokAccount.tiktokAdvertiserId,
      campaign_id: tiktokCampaign.campaign_id,
      adgroup_name: `${campaign.name} - AdGroup`,
      promotion_type: 'WEBSITE',
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
      budget_mode: 'BUDGET_MODE_DAY',
      budget: platformConfig.budget * 100,
      optimization_goal: 'LEAD_GENERATION',
      billing_event: 'CPC',
      schedule_start_time: platformConfig.startDate.toISOString(),
    });

    // Upload video
    const video = await prisma.media.findFirst({
      where: {
        campaignId: campaign.id,
        type: MediaType.VIDEO,
      },
    });

    let videoId: string | undefined;
    if (video) {
      const uploadResult = await accountTikTokService.uploadVideo({
        advertiser_id: tiktokAccount.tiktokAdvertiserId,
        upload_type: 'UPLOAD_BY_URL',
        video_url: video.url,
      });
      videoId = uploadResult.video_id;
    }

    // Get TikTok identity
    const identities = await accountTikTokService.getIdentities();
    const identityId = identities.list[0]?.identity_id;

    // Create Ad
    const ad = await accountTikTokService.createAd({
      advertiser_id: tiktokAccount.tiktokAdvertiserId,
      adgroup_id: adGroup.adgroup_id,
      ad_name: `${campaign.name} - Ad`,
      ad_format: 'SINGLE_VIDEO',
      ad_text: adCopy.primaryText,
      call_to_action: adCopy.callToAction,
      landing_page_url: campaign.tonicTrackingLink || 'https://example.com',
      display_name: campaign.offer.name,
      video_id: videoId,
      identity_id: identityId,
      identity_type: 'CUSTOMIZED_USER',
    });

    // Update database
    await prisma.campaignPlatform.update({
      where: {
        campaignId_platform: {
          campaignId: campaign.id,
          platform: Platform.TIKTOK,
        },
      },
      data: {
        tiktokCampaignId: tiktokCampaign.campaign_id,
        tiktokAdGroupId: adGroup.adgroup_id,
        tiktokAdId: ad.ad_id,
        status: CampaignStatus.ACTIVE,
      },
    });

    return {
      platform: Platform.TIKTOK,
      success: true,
      campaignId: tiktokCampaign.campaign_id,
      adGroupId: adGroup.adgroup_id,
      adId: ad.ad_id,
    };
  }
}

// Export singleton instance
export const campaignOrchestrator = new CampaignOrchestratorService();
export default campaignOrchestrator;
