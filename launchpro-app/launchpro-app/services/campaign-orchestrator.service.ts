import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { tonicService } from './tonic.service';
import { metaService } from './meta.service';
import { tiktokService } from './tiktok.service';
import { aiService } from './ai.service';
import { waitForArticleApproval, formatElapsedTime } from '@/lib/article-polling';
import { waitForTrackingLink, formatPollingTime } from '@/lib/tracking-link-polling';
import { CampaignStatus, Platform, CampaignType, MediaType } from '@prisma/client';
import { Storage } from '@google-cloud/storage';

// Meta Pixel Mapping (Account ID -> Pixel ID)
const META_PIXEL_MAPPING: Record<string, string> = {
  'act_641975565566309': '878273167774607', // B1
  'act_677352071396973': '878273167774607', // A1
  'act_3070045536479246': '878273167774607', // J2 (Placeholder - update if different)
  'act_614906531545813': '878273167774607', // L2 (Placeholder)
  'act_1780161402845930': '878273167774607', // M2 (Placeholder)
  'act_1165341668311653': '878273167774607', // S2 (Placeholder)
  // Add others as needed. Defaulting to the one seen in logs for now.
};

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

  // Account Info
  tonicAccountId: string;

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
    accountId: string; // Meta or TikTok account ID
    performanceGoal?: string;
    budget: number; // in dollars
    startDate: Date;
    generateWithAI: boolean; // Generate images/videos with AI?
  }[];

  // Manual keywords (optional, will be AI-generated if not provided)
  keywords?: string[];

  // Skip platform launch (for manual media upload workflow)
  skipPlatformLaunch?: boolean;
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
   * Rollback campaign if launch fails
   * Cleans up created resources to avoid orphaned data
   */
  private async rollbackCampaign(campaignId: string, tonicCampaignId?: string, credentials?: any) {
    logger.warn('system', 'Rolling back campaign due to failure...', { campaignId });

    try {
      // Mark campaign as FAILED
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });

      // Optionally: Delete Tonic campaign (if policy allows)
      // Note: Tonic API doesn't have a delete endpoint in the docs, so we just mark as stopped
      if (tonicCampaignId && credentials) {
        logger.info('tonic', 'Tonic campaign will remain but marked as failed in our DB');
        // Could potentially stop the campaign in Tonic here if needed
      }

      // Delete generated media from storage to save costs
      const media = await prisma.media.findMany({
        where: { campaignId },
      });

      for (const m of media) {
        if (m.gcsPath) {
          try {
            // Delete from Google Cloud Storage
            const bucket = new Storage({ projectId: process.env.GCP_PROJECT_ID }).bucket(process.env.GCP_STORAGE_BUCKET!);
            await bucket.file(m.gcsPath).delete();
            logger.info('system', `Deleted media file: ${m.gcsPath}`);
          } catch (err: any) {
            logger.warn('system', `Could not delete media file: ${m.gcsPath}`, { error: err.message });
          }
        }
      }

      logger.success('system', 'Campaign rollback completed', { campaignId });
    } catch (error: any) {
      logger.error('system', `Rollback failed: ${error.message}`, {
        campaignId,
        error: error.message,
      });
    }
  }

  /**
   * MAIN METHOD: Launch a complete campaign
   */
  async launchCampaign(params: CreateCampaignParams): Promise<LaunchResult> {
    const errors: string[] = [];
    let campaign: any;
    let tonicCampaignId: string | number | undefined;
    let credentials: any;

    try {
      logger.info('system', 'Starting campaign launch workflow...', {
        name: params.name,
        country: params.country,
        platforms: params.platforms.map(p => p.platform),
      });

      // ============================================
      // STEP 1: Get Tonic credentials and offer details
      // ============================================
      logger.info('tonic', 'Fetching Tonic account credentials...', { accountId: params.tonicAccountId });
      const tonicAccount = await prisma.account.findUnique({
        where: {
          id: params.tonicAccountId,
        },
      });

      if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
        throw new Error(`Tonic account ${params.tonicAccountId} not found or missing credentials.`);
      }

      if (!tonicAccount.isActive) {
        throw new Error(`Tonic account ${tonicAccount.name} is not active.`);
      }

      logger.info('tonic', `Using Tonic account: ${tonicAccount.name}`);

      credentials = {
        consumer_key: tonicAccount.tonicConsumerKey,
        consumer_secret: tonicAccount.tonicConsumerSecret,
      };

      logger.info('tonic', 'Fetching offer details...', { offerId: params.offerId });
      const offers = await tonicService.getOffers(credentials);
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
        logger.info('system', 'Created new offer in database', { offerId: dbOffer.id, name: offer.name });
      }

      // ============================================
      // STEP 2: Create campaign in database
      // ============================================
      logger.info('system', 'Creating campaign in database...');
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
              tonicAccountId: params.tonicAccountId,
              metaAccountId: p.platform === Platform.META ? p.accountId : null,
              tiktokAccountId: p.platform === Platform.TIKTOK ? p.accountId : null,
              performanceGoal: p.performanceGoal,
              budget: p.budget,
              startDate: p.startDate,
              generateWithAI: p.generateWithAI,
              status: CampaignStatus.DRAFT,
            })),
          },
        },
        include: {
          platforms: true,
          offer: true,
        },
      });

      logger.success('system', `Campaign created with ID: ${campaign.id}`);

      // ============================================
      // STEP 3: Detect campaign type (RSOC vs Display) WITH CACHING
      // ============================================
      logger.info('system', 'Detecting optimal campaign type...');

      let supportsRSOC = false;
      let supportsDisplay = false;
      let rsocDomain = '';
      let rsocDomains: any[] = [];

      // Check if capabilities are cached and still valid (24 hours)
      const capabilitiesCacheValid =
        tonicAccount.tonicCapabilitiesLastChecked &&
        new Date().getTime() - new Date(tonicAccount.tonicCapabilitiesLastChecked).getTime() <
        24 * 60 * 60 * 1000;

      if (capabilitiesCacheValid && tonicAccount.tonicSupportsRSOC !== null) {
        // Use cached capabilities
        supportsRSOC = tonicAccount.tonicSupportsRSOC ?? false;
        supportsDisplay = tonicAccount.tonicSupportsDisplay ?? false;
        rsocDomains = (tonicAccount.tonicRSOCDomains as any[]) || [];

        logger.info('system', `✅ Using CACHED capabilities for account "${tonicAccount.name}"`);
        logger.info('system', `   - Supports RSOC: ${supportsRSOC}`);
        logger.info('system', `   - Supports Display: ${supportsDisplay}`);
        logger.info('system', `   - RSOC Domains: ${rsocDomains.length}`);
      } else {
        // Fetch capabilities from Tonic API and cache them
        logger.info('system', `🔄 Fetching fresh capabilities from Tonic API...`);

        // Check RSOC support
        try {
          const domains = await tonicService.getRSOCDomains(credentials);
          if (domains && domains.length > 0) {
            supportsRSOC = true;
            rsocDomains = domains;
            logger.info('tonic', `✅ Account supports RSOC with ${domains.length} domain(s)`);
          } else {
            supportsRSOC = false;
            logger.info('tonic', '❌ Account does not support RSOC (empty domains)');
          }
        } catch (error: any) {
          supportsRSOC = false;
          logger.info('tonic', `❌ Account does not support RSOC (API error: ${error.message})`);
        }

        // Check Display support (by trying to get display offers)
        try {
          const displayOffers = await tonicService.getOffers(credentials, 'display');
          supportsDisplay = displayOffers && displayOffers.length > 0;
          logger.info('tonic', `${supportsDisplay ? '✅' : '❌'} Account ${supportsDisplay ? 'supports' : 'does not support'} Display campaigns`);
        } catch (error: any) {
          supportsDisplay = false;
          logger.info('tonic', `❌ Account does not support Display (API error: ${error.message})`);
        }

        // Update cache in database
        await prisma.account.update({
          where: { id: params.tonicAccountId },
          data: {
            tonicSupportsRSOC: supportsRSOC,
            tonicSupportsDisplay: supportsDisplay,
            tonicRSOCDomains: rsocDomains,
            tonicCapabilitiesLastChecked: new Date(),
          },
        });

        logger.success('system', '💾 Cached capabilities in database');
      }

      // CRITICAL VALIDATION: Check if account can create ANY type of campaign
      if (!supportsRSOC && !supportsDisplay) {
        const errorMsg = `❌ CRITICAL ERROR: Tonic account "${tonicAccount.name}" does not support RSOC or Display campaigns. Please check account permissions or use a different account.`;
        logger.error('system', errorMsg);
        await this.rollbackCampaign(campaign.id, undefined, credentials);
        throw new Error(errorMsg);
      }

      // Determine campaign type based on what account supports
      let campaignType: 'rsoc' | 'display';
      if (supportsRSOC) {
        campaignType = 'rsoc';
        // Use first domain that supports the campaign language
        const matchingDomain = rsocDomains.find((d: any) =>
          d.languages && d.languages.includes(params.language)
        );
        rsocDomain = matchingDomain?.domain || rsocDomains[0]?.domain || '';
        logger.info('tonic', `📝 Will use RSOC domain: ${rsocDomain}`);
      } else if (supportsDisplay) {
        campaignType = 'display';
        logger.info('tonic', `📄 Will use Display campaign (RSOC not available)`);
      } else {
        // This should never happen due to validation above, but keep as safeguard
        throw new Error('No valid campaign type available for this account');
      }

      logger.info('system', `🎯 Final campaign type: ${campaignType.toUpperCase()}`);
      logger.info('system', `Account capabilities: RSOC=${supportsRSOC}, Display=${supportsDisplay}`);

      // ============================================
      // STEP 4: For RSOC, create article FIRST
      // ============================================
      let articleHeadlineId: number | undefined;

      if (campaignType === 'rsoc') {
        logger.info('ai', 'Generating article for RSOC campaign...');

        // Generate article content with AI
        const articleContent = await aiService.generateArticle({
          offerName: offer.name,
          copyMaster: params.copyMaster || `Discover the best deals on ${offer.name}`,
          keywords: params.keywords || [],
          country: params.country,
          language: params.language,
        });

        logger.info('ai', '📄 AI Generated Article Content:', {
          headline: articleContent.headline,
          headlineLength: articleContent.headline.length,
          teaserLength: articleContent.teaser.length,
          phrasesCount: articleContent.contentGenerationPhrases.length,
          teaser: articleContent.teaser.substring(0, 100) + '...',
          phrases: articleContent.contentGenerationPhrases,
        });

        logger.info('tonic', 'Creating article request in Tonic...');
        try {
          const articleRequestPayload = {
            offer_id: parseInt(params.offerId),
            country: params.country,
            language: params.language,
            domain: rsocDomain,
            content_generation_phrases: articleContent.contentGenerationPhrases,
            headline: articleContent.headline,
            teaser: articleContent.teaser,
          };

          logger.info('tonic', '📤 Article request payload:', articleRequestPayload);

          const articleRequestId = await tonicService.createArticleRequest(credentials, articleRequestPayload);

          logger.success('tonic', `Article request created with request_id: ${articleRequestId}`);

          // Save article request ID to campaign
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { tonicArticleId: articleRequestId.toString() },
          });

          // STRATEGY 1: Check for existing approved headlines first
          logger.info('tonic', '🔍 Checking for existing approved headlines...');
          const headlines = await tonicService.getHeadlines(credentials);
          logger.info('tonic', `Found ${headlines.length} total approved headlines`);

          // Find the most recent headline for this offer/country combination
          const matchingHeadline = headlines.find((h: any) =>
            h.offer_id === parseInt(params.offerId) &&
            h.country === params.country
          );

          if (matchingHeadline) {
            // FOUND! Use existing headline
            articleHeadlineId = matchingHeadline.headline_id || matchingHeadline.id;
            logger.success('tonic', `✅ Using EXISTING headline_id: ${articleHeadlineId}`, {
              headline: matchingHeadline.headline,
              offer: matchingHeadline.offer_name,
              country: matchingHeadline.country,
            });
          } else {
            // STRATEGY 2: Wait for the article we just created to be approved
            logger.warn('tonic', '⚠️  No existing approved headline found for this offer/country combination.');
            logger.info('tonic', `⏳ Will wait for article request #${articleRequestId} to be approved...`);

            // Update campaign status to show we're waiting
            await prisma.campaign.update({
              where: { id: campaign.id },
              data: { status: CampaignStatus.GENERATING_AI }, // Keep as GENERATING_AI while waiting
            });

            // Wait for article approval with polling
            const pollingResult = await waitForArticleApproval(credentials, articleRequestId, {
              maxWaitMinutes: 60, // Wait max 60 minutes (Tonic can take longer in development/testing)
              pollingIntervalSeconds: 30, // Check every 30 seconds
              onProgress: (status, elapsedSeconds) => {
                logger.info('tonic', `📊 Progress update: ${status.request_status} (${formatElapsedTime(elapsedSeconds)} elapsed)`);
              },
            });

            if (pollingResult.success && pollingResult.headlineId) {
              // SUCCESS! Article was approved
              articleHeadlineId = parseInt(pollingResult.headlineId);
              logger.success('tonic', `🎉 Article approved after ${formatElapsedTime(pollingResult.elapsedSeconds)}!`, {
                headlineId: articleHeadlineId,
                attempts: pollingResult.attemptsCount,
              });
            } else {
              // FAILED or TIMEOUT
              const errorMsg = pollingResult.error || 'Article approval failed or timed out';
              logger.error('tonic', `❌ ${errorMsg}`, {
                elapsedSeconds: pollingResult.elapsedSeconds,
                attempts: pollingResult.attemptsCount,
              });

              // Rollback and fail the campaign
              await this.rollbackCampaign(campaign.id, tonicCampaignId?.toString(), credentials);
              throw new Error(
                `RSOC article approval failed: ${errorMsg}. ` +
                `The article request (#${articleRequestId}) needs manual review in your Tonic dashboard. ` +
                `You can approve it at: https://publisher.tonic.com`
              );
            }
          }
        } catch (error: any) {
          logger.error('tonic', `Failed to create article: ${error.message}`);
          throw new Error(`RSOC article creation failed: ${error.message}`);
        }
      }

      // ============================================
      // STEP 5: Create campaign in Tonic
      // ============================================
      logger.info('tonic', `Creating ${campaignType.toUpperCase()} campaign in Tonic...`, {
        name: params.name,
        country: params.country,
        offer: offer.name,
        type: campaignType,
        ...(articleHeadlineId && { headline_id: articleHeadlineId }),
      });

      try {
        const campaignParams = {
          name: params.name,
          offer: offer.name,      // Tonic API requires offer name
          offer_id: params.offerId, // And also accepts offer_id
          country: params.country,
          type: campaignType,
          return_type: 'id' as const,
          ...(articleHeadlineId && { headline_id: articleHeadlineId.toString() }), // Include headline_id for RSOC (must be string)
          // NOTE: Domain is NOT sent - Tonic handles it automatically for RSOC campaigns
          // imprint will be auto-detected in tonicService based on EU country
        };

        logger.info('tonic', `Calling Tonic API with campaign type: ${campaignParams.type}`, {
          campaignType: campaignParams.type,
          hasHeadlineId: !!articleHeadlineId,
          headlineId: articleHeadlineId,
        });

        tonicCampaignId = await tonicService.createCampaign(credentials, campaignParams);
      } catch (error: any) {
        logger.error('tonic', `Failed to create Tonic campaign: ${error.message}`, {
          type: campaignType,
          hasHeadlineId: !!articleHeadlineId,
        });
        throw new Error(`Tonic ${campaignType.toUpperCase()} campaign creation failed: ${error.message}. Please check your Tonic account permissions for ${campaignType} campaigns.`);
      }

      logger.success('tonic', `Tonic campaign created with ID: ${tonicCampaignId}`);

      // Wait for tracking link to become available (campaign needs to be "active")
      // This typically takes 5-10 minutes after campaign creation
      logger.info('tonic', '⏳ Waiting for tracking link to become available...');

      const trackingLinkResult = await waitForTrackingLink(
        credentials,
        tonicCampaignId.toString(),
        {
          maxWaitMinutes: 15, // Wait max 15 minutes
          pollingIntervalSeconds: 30, // Check every 30 seconds
          onProgress: (status, elapsedSeconds) => {
            logger.info('tonic', `📊 Progress update: ${status} (${formatPollingTime(elapsedSeconds)} elapsed)`);
          },
        }
      );

      let trackingLink: string;
      if (trackingLinkResult.success && trackingLinkResult.trackingLink) {
        // SUCCESS! Tracking link is available
        trackingLink = trackingLinkResult.trackingLink;
        logger.success('tonic', `🎉 Tracking link obtained after ${formatPollingTime(trackingLinkResult.elapsedSeconds)}!`, {
          trackingLink,
          attempts: trackingLinkResult.attemptsCount,
        });
      } else {
        // TIMEOUT or ERROR - use placeholder
        logger.warn('tonic', `⚠️  Tracking link not available after ${trackingLinkResult.elapsedSeconds}s. Using placeholder.`, {
          error: trackingLinkResult.error,
          attempts: trackingLinkResult.attemptsCount,
        });
        // Set a placeholder that can be updated later when the link becomes available
        // Note: This may cause issues with Meta/TikTok ads if the link is not valid
        trackingLink = `https://tonic-placeholder.com/campaign/${tonicCampaignId}`;
        errors.push(`Tracking link not available yet. Using placeholder: ${trackingLink}`);
      }

      // Update campaign with Tonic info
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          tonicCampaignId: tonicCampaignId.toString(),
          tonicTrackingLink: trackingLink,
        },
      });

      logger.info('system', 'Updated campaign with Tonic tracking link', { trackingLink });

      // ============================================
      // STEP 6: Generate AI Content (Copy Master, Keywords)
      // ============================================
      logger.info('ai', 'Generating AI content...');
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.GENERATING_AI },
      });

      const aiContentResult: any = {};

      // 4a. Generate Copy Master if not provided
      if (!params.copyMaster) {
        logger.info('ai', 'Generating Copy Master...');
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
        logger.success('ai', 'Copy Master generated');
      } else {
        aiContentResult.copyMaster = params.copyMaster;
        logger.info('ai', 'Using provided Copy Master');
      }

      // 4b. Generate Keywords if not provided
      if (!params.keywords || params.keywords.length === 0) {
        logger.info('ai', 'Generating Keywords...');
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
        logger.success('ai', `Generated ${aiContentResult.keywords.length} keywords`, { keywords: aiContentResult.keywords });
      } else {
        aiContentResult.keywords = params.keywords;
        logger.info('ai', 'Using provided keywords', { keywords: params.keywords });
      }

      // 4c. Set keywords in Tonic
      logger.info('tonic', 'Setting keywords in Tonic...', { count: aiContentResult.keywords.length });
      await tonicService.setKeywords(credentials, {
        campaign_id: parseInt(tonicCampaignId.toString()),
        keywords: aiContentResult.keywords,
        keyword_amount: aiContentResult.keywords.length,
      });
      logger.success('tonic', 'Keywords set in Tonic');

      // 4d. Article already created if RSOC (in Step 4)
      if (campaignType === 'rsoc' && articleHeadlineId) {
        logger.info('ai', 'Article already created for RSOC campaign', { headline_id: articleHeadlineId });
        aiContentResult.article = {
          headline_id: articleHeadlineId,
          message: 'Article created before campaign creation',
        };
      } else {
        logger.info('ai', 'Skipping article generation for Display campaign');
      }

      // ============================================
      // STEP 7: Generate Media (Images/Videos) for each platform
      // ============================================
      aiContentResult.media = {
        images: [],
        videos: [],
      };

      for (const platformConfig of params.platforms) {
        if (!platformConfig.generateWithAI) {
          logger.info('ai', `⏭️  Skipping AI media generation for ${platformConfig.platform} (manual upload mode)`);
          logger.info('system', `User will upload media manually for ${platformConfig.platform}`);
          continue;
        }

        // Skip Tonic platform (only generate media for Meta/TikTok)
        if (platformConfig.platform === 'TONIC') {
          continue;
        }

        logger.info('ai', `Generating media for ${platformConfig.platform}...`);

        // Generate Ad Copy specific to platform
        const adCopy = await aiService.generateAdCopy({
          offerName: offer.name,
          copyMaster: aiContentResult.copyMaster,
          platform: platformConfig.platform, // Now TypeScript knows it's 'META' | 'TIKTOK'
          adFormat: 'IMAGE', // or VIDEO based on config
        });

        // Generate Image
        logger.info('ai', `Generating image for ${platformConfig.platform}...`);
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
        logger.success('ai', `Image generated for ${platformConfig.platform}`, { url: image.imageUrl });

        // TEMPORARILY DISABLED: Video generation (Veo model not available in GCP project)
        // Users should upload videos manually for now
        logger.warn('ai', `⚠️  Video generation temporarily disabled (Veo model not available). Please upload videos manually.`);

        // TODO: Re-enable when Veo model is available or use alternative video generation
        // if (platformConfig.platform === 'TIKTOK' || platformConfig.platform === 'META') {
        //   logger.info('ai', `Generating video for ${platformConfig.platform}...`);
        //   const videoPrompt = `${adCopy.headline}. Professional advertising video for ${offer.name}. Dynamic, engaging, ${platformConfig.platform} style.`;
        //
        //   const video = await aiService.generateVideo({
        //     prompt: videoPrompt,
        //     durationSeconds: 5,
        //     aspectRatio: platformConfig.platform === 'TIKTOK' ? '9:16' : '16:9',
        //   });
        //
        //   await prisma.media.create({
        //     data: {
        //       campaignId: campaign.id,
        //       type: MediaType.VIDEO,
        //       generatedByAI: true,
        //       aiModel: 'veo-3.1-fast',
        //       aiPrompt: videoPrompt,
        //       url: video.videoUrl,
        //       gcsPath: video.gcsPath,
        //       fileName: video.gcsPath.split('/').pop() || 'video.mp4',
        //       mimeType: 'video/mp4',
        //       duration: 5,
        //     },
        //   });
        //
        //   aiContentResult.media.videos.push(video.videoUrl);
        //   logger.success('ai', `Video generated for ${platformConfig.platform}`, { url: video.videoUrl });
        // }
      }

      logger.success('ai', 'AI content generation complete!');

      // Update status to ready to launch
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.READY_TO_LAUNCH },
      });

      // ============================================
      // STEP 8: Configure Pixels (BEFORE launching to platforms)
      // ============================================
      // IMPORTANT: Pixels must be configured in Tonic BEFORE creating ads
      // This ensures tracking is properly set up from the moment ads go live
      //
      // NOTE: Despite Tonic documentation being incomplete, pixel_id IS REQUIRED.
      // The pixel_id is the Meta/TikTok pixel ID that must already exist in those platforms.
      // Tonic uses this to configure tracking between their system and your pixel.

      // Pixel mapping based on account names (Meta pixel IDs from your configuration)
      const META_PIXEL_MAPPING: { [key: string]: string } = {
        // Meta Accounts - Quick Enterprise LLC Portfolio
        'Quick Enterprise LLC - H (RSOC Tonic)': '878273167774607',
        'Quick Enterprise LLC - X (RSOC Tonic)': '847010030396510',
        'Quick Enterprise LLC - Q': '860387142264159',
        'Quick Enterprise LLC - R (RSOC Tonic)': '721173856973839',
        'Quick Enterprise LLC - Y (Rsoc Tonic)': '1039541308325786',
        'Quick Enterprise LLC - S': '2180869225678766',
        'Quick Enterprise LLC - Z': '2718831848325465',

        // Meta Accounts - Capital Quick LLC Portfolio
        'Capital Quick LLC - A1': '1179895397093948',
        'Capital Quick LLC - B1 - Rsoc Tonic': '1435976930918931',

        // Meta Accounts - Global Qreate Portfolio
        'Global Qreate - L2 - Loans': '1203351311131422',
        'Global Qreate - Inforproductos': '1891445634963589',

        // Legacy short names (backwards compatibility)
        'H - RSOC Tonic': '878273167774607',
        'X - RSOC Tonic': '847010030396510',
        'Q': '860387142264159',
        'R - RSOC Tonic': '721173856973839',
        'Y - Rsoc Tonic': '1039541308325786',
        'S': '2180869225678766',
        'Z': '2718831848325465',
        'A1': '1179895397093948',
        'B1 - Rsoc Tonic': '1435976930918931',
        'L2 - Loans': '1203351311131422',
        'Inforproductos': '1891445634963589',
        'B3': '764050146176958',
      };

      // Access Token mapping for Meta accounts (for Facebook Conversion API)
      const META_ACCESS_TOKEN_MAPPING: { [key: string]: string } = {
        // Quick Enterprise LLC Portfolio
        'Quick Enterprise LLC - H (RSOC Tonic)': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD',
        'Quick Enterprise LLC - X (RSOC Tonic)': 'EAAYl7gsCHoQBOyLePTu9YGoP5oxZCIVW25xphvSsHplE5NGJ5iCen8k2EUdh4W8PQChdH8hrfcEWZCWwrmGtBlblmkIKzbmgvOfIRTJUJtkv41bmjhDxnEKc5sOBCKzPFnzLw2c5AiqFvZAaYuZCQXgoxqWnhJeZBxyIfGATnBaNl31cTnM1RZBQW9iDbzFWjkZCwZDZD',
        'Quick Enterprise LLC - Q': 'EAAYl7gsCHoQBOzwsPBHfQz15ZByoM5Tb2gqqZAA2Vonxh8xZBqhav39aY8YRt9fdckRDCFSahv9g1VZAZAYPgYZAZCjvyRuN8uBfOrVkGeaD3Kg1RKdZCb3nRKPppgNjDKLf5TCGfZAZAcz86ydf71P0zqwXxgEdXdkOyHei8AZCzmxW4LFgagvh0nxDNZA619ym9NAXFwZDZD',
        'Quick Enterprise LLC - Y (Rsoc Tonic)': 'EAAYl7gsCHoQBO1rJjzTkPmehaQaXd4yuSlcFQqo9wicerpGnmxwbGQNfQr0AKdwiBq5suGUxRsPLBAcLEY2NeJ5VQEvZANpLmdx2KWiOrE6ujdJqQGNbspu2O3OtJoruFE44qN77Nu8fR5NWC9maP5OSWbyXJznieeSddXgj6VjLjwmtvML4eBdoKyngjBAZDZD',
        'Quick Enterprise LLC - S': 'EAAYl7gsCHoQBO8UAm6VXlDRvU7ZClNXtZBrvnUWGLO0DvxJvk7vqGGCJRHM1Gq65XFZBxKTMWwVOOuSWiHshbZAvZCZAZA0nlEkbFeAaMMZC7xklFvHoEDcI7wtP6S34CmVFcLPi2WSo06DZCD9QAW3OCY7sfnIwLFDjoRTdMoOAc2V1OxNsxA1OccDjow9XEcUlGNQZDZD',
        'Quick Enterprise LLC - Z': 'EAAYl7gsCHoQBO5ZBu350MRWaZBWDigenBWmLfiN9BCZCjZAu5CNYvx7gw2mIBtcvQZC4LnzePD1dzoScQkIWkZB81SouVQcu4jFFTND85mE1MQEkMnc97V6mLNdZB2Jj0ZCmQmSCRrL6UaHDZCOw2vVuJYrgOZBVDHqbKh2VzGbhk8sWEBJfm3k8BMLgMQ9BGNy4F0bgZDZD',

        // Capital Quick LLC Portfolio
        'Capital Quick LLC - A1': 'EABZB8DcFpOfsBOynXLGBDvWfGotmCDsrwHy2eaM3h5dbpVkHzg3vUMKmT481gRJlNa7bVRm1yE7ZA3M049Se5wrE0YSvPRDGQeaewl07KIK7uU1yjOolDjoJSZBn2Pno7VMZB2fmPhQH7rux8iITnSVp49Vhf8tYZBWgWqgEFzdWVizYHgBoZChHTi76u68jEVYgZDZD',
        'Capital Quick LLC - B1 - Rsoc Tonic': 'EABZB8DcFpOfsBO8Vkz5gBxmH9wIkH7CcPxgr9ZAbfF5lhslhfDZBRu7F9L5ZCIWS1H7jlFM3Mef7cRaZBg0IuR2aNo9BOA3HvWECyXHuDV2gEnVRS1aCzQmGV4LFvF6aOyjnyMcJFZBMZAq9iKCj6fmcmdqD25CIkwfvI1Kud269QIxZA0vreVbqUmIUA0XZAxMsmbQZDZD',

        // Global Qreate Portfolio
        'Global Qreate - L2 - Loans': 'EAAJRmTwhsNgBO1OnDiD8eS4vZB2m1JGFUZAi9ErzWUBlV0hPtuoNZCL6TBADDy6jXAbd0lvc0RiZCOxrK991pcuW8b519EnhrpPKt4ZBTLLmUYMkkV4LZCYx1GAkU0uhBbekynZBdrpE30S9Th1x1zwpIUe0OACto0iKDZCFzfd6OBZCZBZBSRcPxZBMGrNZA4BOlqUrUAQZDZD',
        'Global Qreate - Inforproductos': 'EABZB8DcFpOfsBO6vHZBiXZBgo2LtZCjEpt0qOyQGvxxIN0LgOXp6vxU9VTUQmwkzMnevZAv5LnE2UKFNxhITNZAJb5Crt3tUcNZBREinKrlU4cf29T6hIqxPAZCfKbjbQLRoWO5zkZAZC3Axshd8jstZBnDCwFLjZAd9oWQ9bwCHReODOWltyJVZAudg2PkyDSOS6PXwknwZDZD',

        // Legacy short names (backwards compatibility)
        'H - RSOC Tonic': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD',
        'X - RSOC Tonic': 'EAAYl7gsCHoQBOyLePTu9YGoP5oxZCIVW25xphvSsHplE5NGJ5iCen8k2EUdh4W8PQChdH8hrfcEWZCWwrmGtBlblmkIKzbmgvOfIRTJUJtkv41bmjhDxnEKc5sOBCKzPFnzLw2c5AiqFvZAaYuZCQXgoxqWnhJeZBxyIfGATnBaNl31cTnM1RZBQW9iDbzFWjkZCwZDZD',
        'Q': 'EAAYl7gsCHoQBOzwsPBHfQz15ZByoM5Tb2gqqZAA2Vonxh8xZBqhav39aY8YRt9fdckRDCFSahv9g1VZAZAYPgYZAZCjvyRuN8uBfOrVkGeaD3Kg1RKdZCb3nRKPppgNjDKLf5TCGfZAZAcz86ydf71P0zqwXxgEdXdkOyHei8AZCzmxW4LFgagvh0nxDNZA619ym9NAXFwZDZD',
        'Y - Rsoc Tonic': 'EAAYl7gsCHoQBO1rJjzTkPmehaQaXd4yuSlcFQqo9wicerpGnmxwbGQNfQr0AKdwiBq5suGUxRsPLBAcLEY2NeJ5VQEvZANpLmdx2KWiOrE6ujdJqQGNbspu2O3OtJoruFE44qN77Nu8fR5NWC9maP5OSWbyXJznieeSddXgj6VjLjwmtvML4eBdoKyngjBAZDZD',
        'S': 'EAAYl7gsCHoQBO8UAm6VXlDRvU7ZClNXtZBrvnUWGLO0DvxJvk7vqGGCJRHM1Gq65XFZBxKTMWwVOOuSWiHshbZAvZCZAZA0nlEkbFeAaMMZC7xklFvHoEDcI7wtP6S34CmVFcLPi2WSo06DZCD9QAW3OCY7sfnIwLFDjoRTdMoOAc2V1OxNsxA1OccDjow9XEcUlGNQZDZD',
        'Z': 'EAAYl7gsCHoQBO5ZBu350MRWaZBWDigenBWmLfiN9BCZCjZAu5CNYvx7gw2mIBtcvQZC4LnzePD1dzoScQkIWkZB81SouVQcu4jFFTND85mE1MQEkMnc97V6mLNdZB2Jj0ZCmQmSCRrL6UaHDZCOw2vVuJYrgOZBVDHqbKh2VzGbhk8sWEBJfm3k8BMLgMQ9BGNy4F0bgZDZD',
        'A1': 'EABZB8DcFpOfsBOynXLGBDvWfGotmCDsrwHy2eaM3h5dbpVkHzg3vUMKmT481gRJlNa7bVRm1yE7ZA3M049Se5wrE0YSvPRDGQeaewl07KIK7uU1yjOolDjoJSZBn2Pno7VMZB2fmPhQH7rux8iITnSVp49Vhf8tYZBWgWqgEFzdWVizYHgBoZChHTi76u68jEVYgZDZD',
        'B1 - Rsoc Tonic': 'EABZB8DcFpOfsBO8Vkz5gBxmH9wIkH7CcPxgr9ZAbfF5lhslhfDZBRu7F9L5ZCIWS1H7jlFM3Mef7cRaZBg0IuR2aNo9BOA3HvWECyXHuDV2gEnVRS1aCzQmGV4LFvF6aOyjnyMcJFZBMZAq9iKCj6fmcmdqD25CIkwfvI1Kud269QIxZA0vreVbqUmIUA0XZAxMsmbQZDZD',
        'L2 - Loans': 'EAAJRmTwhsNgBO1OnDiD8eS4vZB2m1JGFUZAi9ErzWUBlV0hPtuoNZCL6TBADDy6jXAbd0lvc0RiZCOxrK991pcuW8b519EnhrpPKt4ZBTLLmUYMkkV4LZCYx1GAkU0uhBbekynZBdrpE30S9Th1x1zwpIUe0OACto0iKDZCFzfd6OBZCZBZBSRcPxZBMGrNZA4BOlqUrUAQZDZD',
        'Inforproductos': 'EABZB8DcFpOfsBO6vHZBiXZBgo2LtZCjEpt0qOyQGvxxIN0LgOXp6vxU9VTUQmwkzMnevZAv5LnE2UKFNxhITNZAJb5Crt3tUcNZBREinKrlU4cf29T6hIqxPAZCfKbjbQLRoWO5zkZAZC3Axshd8jstZBnDCwFLjZAd9oWQ9bwCHReODOWltyJVZAudg2PkyDSOS6PXwknwZDZD',
        'B3': 'EAADuOFCzsHsBPPOGO8j4fzZBKy4BRViYTWiPiCZChKNAQ3sWVhWlTvTp267FXnLEzHgwEEMbWxoUz9fbQKBWaWP2iOSGbM00o3091hARmTf0QTlgPYbpt9a52cqNIxXMEBNx02YL2xzq0sSdepJzPTQ3IQ4a9OU0KEoGZBZAv7ul23HtpwoS5xaWSWCt4kmtGwZDZD',
      };

      // TikTok constants (same for all accounts)
      const TIKTOK_PIXEL_ID = 'CQHUEGBC77U4RGRFJN4G';
      const TIKTOK_ACCESS_TOKEN = '50679817ad0f0f06d1dadd43dbce8f3345b676cd';

      logger.info('tonic', 'Configuring tracking pixels in Tonic...');
      for (const platformConfig of params.platforms) {
        try {
          if (platformConfig.platform === Platform.META) {
            // Get Meta account to fetch pixel ID and access token
            const metaAccount = await prisma.account.findUnique({
              where: { id: platformConfig.accountId },
            });

            if (!metaAccount) {
              throw new Error(`Meta account ${platformConfig.accountId} not found`);
            }

            // Get pixel ID and access token from mappings
            const pixelId = META_PIXEL_MAPPING[metaAccount.name];
            const accessToken = META_ACCESS_TOKEN_MAPPING[metaAccount.name];

            if (!pixelId) {
              throw new Error(
                `No pixel mapping found for Meta account "${metaAccount.name}". ` +
                `Please add it to META_PIXEL_MAPPING in campaign-orchestrator.service.ts`
              );
            }

            if (!accessToken) {
              throw new Error(
                `No access token found for Meta account "${metaAccount.name}". ` +
                `Please add it to META_ACCESS_TOKEN_MAPPING in campaign-orchestrator.service.ts`
              );
            }

            logger.info('tonic', `Configuring Facebook pixel ${pixelId} for account "${metaAccount.name}"...`);

            await tonicService.createPixel(credentials, 'facebook', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              pixel_id: pixelId, // REQUIRED
              access_token: accessToken, // REQUIRED for Facebook Conversion API
              event_name: 'Lead',
              revenue_type: 'preestimated_revenue',
            });

            logger.success('tonic', `✅ Facebook pixel ${pixelId} configured for campaign ${tonicCampaignId}`);

          } else if (platformConfig.platform === Platform.TIKTOK) {
            logger.info('tonic', `Configuring TikTok pixel ${TIKTOK_PIXEL_ID} for campaign ${tonicCampaignId}...`);

            await tonicService.createPixel(credentials, 'tiktok', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              pixel_id: TIKTOK_PIXEL_ID, // REQUIRED
              access_token: TIKTOK_ACCESS_TOKEN, // REQUIRED
              revenue_type: 'preestimated_revenue',
            });

            logger.success('tonic', `✅ TikTok pixel ${TIKTOK_PIXEL_ID} configured for campaign ${tonicCampaignId}`);
          }
        } catch (error: any) {
          // FAIL-FAST: Pixel configuration is CRITICAL - cannot proceed without it
          logger.error('tonic', `❌ CRITICAL: Failed to configure pixel for ${platformConfig.platform}`, {
            platform: platformConfig.platform,
            error: error.message,
            response: error.response?.data || 'No response data',
            stack: error.stack,
          });

          throw new Error(
            `Campaign cannot proceed without tracking pixel for ${platformConfig.platform}. ` +
            `Error: ${error.message}. Tonic API response: ${JSON.stringify(error.response?.data || {})}`
          );
        }
      }

      // ============================================
      // STEP 9: Launch to platforms (Meta/TikTok)
      // ============================================
      let platformResults: any[] = [];
      let allSuccessful = true;

      if (params.skipPlatformLaunch) {
        // Skip platform launch - will be done later via /api/campaigns/[id]/launch
        logger.info('system', '⏭️  Skipping platform launch (manual media upload mode)');
        logger.info('system', '📌 Campaign created successfully. Upload media files and then call /api/campaigns/[id]/launch to complete.');

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.DRAFT }, // Keep as DRAFT until manual launch
        });

        return {
          success: true,
          campaignId: campaign.id,
          tonicCampaignId: tonicCampaignId.toString(),
          tonicTrackingLink: trackingLink,
          platforms: [], // No platforms launched yet
          aiContent: aiContentResult,
          errors: errors.length > 0 ? errors : undefined,
        };
      } else {
        // Normal flow: Launch to platforms immediately
        logger.info('system', 'Launching campaigns to platforms...');
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.LAUNCHING },
        });

        for (const platformConfig of params.platforms) {
          try {
            logger.info('system', `Launching to ${platformConfig.platform}...`);

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
            logger.error('system', `Error launching to ${platformConfig.platform}: ${error.message}`, {
              platform: platformConfig.platform,
              error: error.message,
              stack: error.stack,
            });
            errors.push(`${platformConfig.platform}: ${error.message}`);
            platformResults.push({
              platform: platformConfig.platform,
              success: false,
              error: error.message,
            });
          }
        }

        // ============================================
        // STEP 10: Mark as ACTIVE
        // ============================================
        allSuccessful = platformResults.every((r) => r.success);

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: allSuccessful ? CampaignStatus.ACTIVE : CampaignStatus.FAILED,
            launchedAt: new Date(),
          },
        });

        logger.success('system', `Campaign launch complete! Status: ${allSuccessful ? 'ACTIVE' : 'FAILED'}`, {
          campaignId: campaign.id,
          platforms: platformResults.map(p => ({ platform: p.platform, success: p.success })),
        });

        return {
          success: allSuccessful,
          campaignId: campaign.id,
          tonicCampaignId: tonicCampaignId.toString(),
          tonicTrackingLink: trackingLink,
          platforms: platformResults,
          aiContent: aiContentResult,
          errors: errors.length > 0 ? errors : undefined,
        };
      }
    } catch (error: any) {
      logger.error('system', `Campaign launch failed: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        campaignId: campaign?.id,
      });

      // Rollback campaign if it was created
      if (campaign?.id) {
        await this.rollbackCampaign(
          campaign.id,
          tonicCampaignId?.toString(),
          credentials
        );
      }

      // Throw error with user-friendly message
      throw new Error(
        `Campaign launch failed: ${error.message}. The system has rolled back any partial changes.`
      );
    }
  }

  /**
   * Launch campaign to Meta (Facebook/Instagram)
   *
   * Supports both images and videos according to Meta Ads API documentation:
   * - Images: JPG, PNG, max 30MB, recommended 1:1 aspect ratio
   * - Videos: MP4, MOV, max 4GB, 1-241 min duration
   */
  private async launchToMeta(campaign: any, platformConfig: any, aiContent: any) {
    logger.info('meta', 'Creating Meta campaign...', { campaignName: campaign.name });

    // Fetch the Meta Account to get the correct Ad Account ID
    const metaAccount = await prisma.account.findUnique({
      where: { id: platformConfig.accountId },
    });

    if (!metaAccount || !metaAccount.metaAdAccountId) {
      throw new Error(`Meta account not found or missing Ad Account ID for config ID: ${platformConfig.accountId}`);
    }

    const adAccountId = metaAccount.metaAdAccountId;
    logger.info('meta', `Using Meta Ad Account: ${metaAccount.name} (${adAccountId})`);

    // Fetch ALL media for this campaign (manual uploads or AI-generated)
    const allMedia = await prisma.media.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
    });

    // Separate by type
    const images = allMedia.filter(m => m.type === MediaType.IMAGE);
    const videos = allMedia.filter(m => m.type === MediaType.VIDEO);

    logger.info('meta', `Found ${images.length} images and ${videos.length} videos for campaign`, {
      images: images.map(i => i.fileName),
      videos: videos.map(v => v.fileName),
    });

    // Validate that we have media
    if (images.length === 0 && videos.length === 0) {
      throw new Error('No media found for Meta campaign. Please upload at least one image or video.');
    }

    // Determine ad format (prefer video if available, otherwise image)
    const useVideo = videos.length > 0;
    const adFormat = useVideo ? 'VIDEO' : 'IMAGE';

    // Generate ad copy specific to Meta
    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'META',
      adFormat: adFormat,
    });

    // Determine budget strategy: CBO (Campaign Budget Optimization) vs ABO (Ad Set Budget Optimization)
    const isCBO = campaign.campaignType === 'CBO';
    const budgetInCents = parseInt(platformConfig.budget) * 100; // Convert to cents (Meta requirement)

    logger.info('meta', `Using ${isCBO ? 'CBO (Campaign Budget Optimization)' : 'ABO (Ad Set Budget Optimization)'}`, {
      campaignType: campaign.campaignType,
      budget: platformConfig.budget,
      budgetInCents,
    });

    // Create Campaign (according to Meta Ads API - OUTCOME_LEADS for lead generation)
    // ALWAYS use CBO mode: Budget at campaign level for better optimization
    const metaCampaign = await metaService.createCampaign({
      name: campaign.name,
      objective: 'OUTCOME_LEADS', // Required for lead generation campaigns
      status: 'PAUSED',
      special_ad_categories: [], // Add if needed for housing/credit/employment
      daily_budget: budgetInCents, // CBO: Set budget at campaign level
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP', // Explicitly set to Lowest Cost to avoid "bid_amount required" error
    }, adAccountId);

    logger.success('meta', `✅ Meta campaign created with ID: ${metaCampaign.id} (CBO mode - budget at campaign level)`);

    // Get Pixel ID for this account
    const pixelId = META_PIXEL_MAPPING[adAccountId] || '878273167774607'; // Fallback to default if not found
    logger.info('meta', `Using Pixel ID: ${pixelId} for Account: ${adAccountId}`);

    // Create Ad Set (according to Meta Ads API)
    // CBO MODE: NO budget, NO bid_strategy at AdSet level
    // - Campaign handles budget optimization across all ad sets
    // - Meta automatically determines optimal bids
    // - Bidding strategy is inherited from campaign-level optimization
    const adSet = await metaService.createAdSet({
      campaign_id: metaCampaign.id,
      name: `${campaign.name} - AdSet`,
      optimization_goal: 'OFFSITE_CONVERSIONS', // Correct goal for Website Leads (Pixel)
      billing_event: 'IMPRESSIONS', // Standard for lead gen
      // NO bid_strategy in CBO mode - Meta handles this at campaign level
      // NO bid_amount - Not needed in CBO mode
      // NO daily_budget - Already set at campaign level
      start_time: new Date(platformConfig.startDate).toISOString(),
      targeting: {
        geo_locations: {
          countries: [campaign.country], // Use campaign country
        },
      },
      status: 'PAUSED',
      promoted_object: {
        pixel_id: pixelId,
        custom_event_type: 'LEAD',
      },
    }, adAccountId);

    logger.success('meta', `Meta ad set created with ID: ${adSet.id}`);

    // Upload media to Meta
    let imageHash: string | undefined;
    let videoId: string | undefined;

    if (useVideo) {
      // UPLOAD VIDEO
      const video = videos[0]; // Use first video
      logger.info('meta', `Uploading video to Meta: ${video.fileName}`);

      const axios = require('axios');
      const response = await axios.get(video.url, { responseType: 'arraybuffer' });
      const videoBuffer = Buffer.from(response.data);

      videoId = await metaService.uploadVideo(videoBuffer, video.fileName, adAccountId);

      // Update media record
      await prisma.media.update({
        where: { id: video.id },
        data: { usedInMeta: true },
      });

      logger.success('meta', `Video uploaded successfully to Meta`, { videoId });
    } else {
      // UPLOAD IMAGE
      const image = images[0]; // Use first image
      logger.info('meta', `Uploading image to Meta: ${image.fileName}`);

      const axios = require('axios');
      const response = await axios.get(image.url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      imageHash = await metaService.uploadImage(imageBuffer, image.fileName, adAccountId);

      // Update media record
      await prisma.media.update({
        where: { id: image.id },
        data: {
          usedInMeta: true,
          metaHash: imageHash,
        },
      });

      logger.success('meta', `Image uploaded successfully to Meta`, { imageHash });
    }

    // Create Ad Creative (according to Meta Ads API)
    // Use the Page ID from the Account settings
    if (!metaAccount.metaPageId) {
      throw new Error(`Meta Page ID not found for account ${metaAccount.name}. Please configure it in the Account settings.`);
    }

    const creative = await metaService.createAdCreative({
      name: `${campaign.name} - Creative`,
      object_story_spec: {
        page_id: metaAccount.metaPageId,
        ...(useVideo ? {
          video_data: {
            video_id: videoId!,
            title: adCopy.headline,
            message: adCopy.primaryText,
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: campaign.tonicTrackingLink || 'https://example.com' },
            },
          },
        } : {
          link_data: {
            link: campaign.tonicTrackingLink || 'https://example.com',
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            image_hash: imageHash!,
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: campaign.tonicTrackingLink || 'https://example.com' },
            },
          },
        }),
      },
    }, adAccountId);

    logger.success('meta', `Meta creative created with ID: ${creative.id}`);

    // Create Ad (according to Meta Ads API)
    const ad = await metaService.createAd({
      name: `${campaign.name} - Ad`,
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    }, adAccountId);

    logger.success('meta', `Meta ad created with ID: ${ad.id}`);

    // Update campaign-platform status
    await prisma.campaignPlatform.updateMany({
      where: {
        campaignId: campaign.id,
        platform: Platform.META,
      },
      data: {
        metaCampaignId: metaCampaign.id,
        metaAdSetId: adSet.id,
        metaAdId: ad.id,
        status: CampaignStatus.ACTIVE,
      },
    });

    logger.success('meta', `Meta campaign launched successfully`, {
      campaignId: metaCampaign.id,
      adSetId: adSet.id,
      adId: ad.id,
      adFormat,
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
   *
   * Supports both images and videos according to TikTok Ads API documentation:
   * - Images: JPG, PNG, 50KB-500KB, recommended 9:16 aspect ratio
   * - Videos: MP4, MOV, MPEG, max 500MB, 5-60 sec, recommended 9:16 aspect ratio
   */
  private async launchToTikTok(campaign: any, platformConfig: any, aiContent: any) {
    logger.info('tiktok', 'Creating TikTok campaign...', { campaignName: campaign.name });

    // Fetch ALL media for this campaign (manual uploads or AI-generated)
    const allMedia = await prisma.media.findMany({
      where: { campaignId: campaign.id },
      orderBy: { createdAt: 'asc' },
    });

    // Separate by type
    const images = allMedia.filter(m => m.type === MediaType.IMAGE);
    const videos = allMedia.filter(m => m.type === MediaType.VIDEO);

    logger.info('tiktok', `Found ${images.length} images and ${videos.length} videos for campaign`, {
      images: images.map(i => i.fileName),
      videos: videos.map(v => v.fileName),
    });

    // Validate that we have media
    if (images.length === 0 && videos.length === 0) {
      throw new Error('No media found for TikTok campaign. Please upload at least one image or video.');
    }

    // Determine ad format (TikTok prefers video, but images work too)
    const useVideo = videos.length > 0;
    const adFormat = useVideo ? 'VIDEO' : 'IMAGE';

    // Generate ad copy specific to TikTok
    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
      adFormat: adFormat,
    });

    // Create Campaign (according to TikTok Ads API - LEAD_GENERATION objective)
    const tiktokCampaign = await tiktokService.createCampaign({
      advertiser_id: tiktokService['advertiserId'],
      campaign_name: campaign.name,
      objective_type: 'LEAD_GENERATION', // For lead generation campaigns
      budget_mode: 'BUDGET_MODE_DAY',
      budget: parseInt(platformConfig.budget) * 100, // Convert to cents (TikTok requirement)
    });

    logger.success('tiktok', `TikTok campaign created with ID: ${tiktokCampaign.campaign_id} `);

    // Create Ad Group (according to TikTok Ads API)
    const adGroup = await tiktokService.createAdGroup({
      advertiser_id: tiktokService['advertiserId'],
      campaign_id: tiktokCampaign.campaign_id,
      adgroup_name: `${campaign.name} - AdGroup`,
      promotion_type: 'WEBSITE', // For website traffic
      placement_type: 'PLACEMENT_TYPE_AUTOMATIC', // Auto placements
      budget_mode: 'BUDGET_MODE_DAY',
      budget: parseInt(platformConfig.budget) * 100,
      optimization_goal: 'LEAD_GENERATION', // For LEAD_GENERATION objective
      billing_event: 'OCPM', // Optimized CPM for lead gen
      schedule_start_time: new Date(platformConfig.startDate).toISOString(),
      location_ids: [campaign.country], // Use campaign country
    });

    logger.success('tiktok', `TikTok ad group created with ID: ${adGroup.adgroup_id} `);

    // Upload media to TikTok
    let videoId: string | undefined;
    let imageIds: string[] = [];

    if (useVideo) {
      // UPLOAD VIDEO
      const video = videos[0]; // Use first video
      logger.info('tiktok', `Uploading video to TikTok: ${video.fileName} `);

      // TikTok supports upload by URL (easier with signed URLs)
      const uploadResult = await tiktokService.uploadVideo({
        advertiser_id: tiktokService['advertiserId'],
        upload_type: 'UPLOAD_BY_URL',
        video_url: video.url,
        auto_bind_enabled: true,
        auto_fix_enabled: true,
      });

      videoId = uploadResult.video_id;

      // Update media record
      await prisma.media.update({
        where: { id: video.id },
        data: {
          usedInTiktok: true,
          tiktokVideoId: videoId,
        },
      });

      logger.success('tiktok', `Video uploaded successfully to TikTok`, { videoId });
    } else {
      // UPLOAD IMAGE
      const image = images[0]; // Use first image
      logger.info('tiktok', `Uploading image to TikTok: ${image.fileName} `);

      const axios = require('axios');
      const response = await axios.get(image.url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      const uploadResult = await tiktokService.uploadImage(imageBuffer, image.fileName);
      imageIds = [uploadResult.id];

      // Update media record
      await prisma.media.update({
        where: { id: image.id },
        data: { usedInTiktok: true },
      });

      logger.success('tiktok', `Image uploaded successfully to TikTok`, { imageId: imageIds[0] });
    }

    // Get TikTok identity (required for ads)
    const identities = await tiktokService.getIdentities();
    const identityId = identities.list?.[0]?.identity_id;

    if (!identityId) {
      throw new Error('No TikTok identity found. Please set up a TikTok account first.');
    }

    // Create Ad (according to TikTok Ads API)
    const ad = await tiktokService.createAd({
      advertiser_id: tiktokService['advertiserId'],
      adgroup_id: adGroup.adgroup_id,
      ad_name: `${campaign.name} - Ad`,
      ad_format: useVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE',
      ad_text: adCopy.primaryText,
      call_to_action: adCopy.callToAction || 'LEARN_MORE',
      landing_page_url: campaign.tonicTrackingLink || 'https://example.com',
      display_name: campaign.offer.name,
      ...(useVideo ? { video_id: videoId } : { image_ids: imageIds }),
      identity_id: identityId,
      identity_type: 'CUSTOMIZED_USER',
    });

    logger.success('tiktok', `TikTok ad created with ID: ${ad.ad_id} `);

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

    logger.success('tiktok', 'TikTok campaign launched successfully', {
      campaignId: tiktokCampaign.campaign_id,
      adGroupId: adGroup.adgroup_id,
      adId: ad.ad_id,
      adFormat,
    });

    return {
      platform: Platform.TIKTOK,
      success: true,
      campaignId: tiktokCampaign.campaign_id,
      adGroupId: adGroup.adgroup_id,
      adId: ad.ad_id,
    };
  }

  /**
   * Launch an existing campaign to configured platforms
   *
   * This method is called AFTER the campaign has been created and media has been uploaded.
   * It assumes the campaign already exists in the database with:
   * - Tonic campaign created
   * - Media files uploaded (if required)
   * - Platform configurations set
   */
  async launchExistingCampaignToPlatforms(campaignId: string): Promise<LaunchResult> {
    const errors: string[] = [];

    try {
      logger.info('system', `Launching existing campaign ${campaignId} to platforms...`);

      // Fetch campaign with all related data
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          offer: true,
          platforms: true,
          media: true,
        },
      });

      if (!campaign) {
        throw new Error(`Campaign ${campaignId} not found`);
      }

      // Validate that Tonic campaign was created (tracking link is optional - will use fallback if missing)
      if (!campaign.tonicCampaignId) {
        throw new Error(`Campaign ${campaignId} does not have Tonic campaign ID.Please create the campaign first.`);
      }

      // Warn if tracking link is missing (but don't fail - ads will use fallback URL)
      if (!campaign.tonicTrackingLink || campaign.tonicTrackingLink.includes('tonic-placeholder')) {
        logger.warn('system', '⚠️  Tracking link is missing or placeholder. Ads will use fallback URL.', {
          tonicCampaignId: campaign.tonicCampaignId,
          trackingLink: campaign.tonicTrackingLink,
        });
      }

      logger.info('system', `Found campaign: ${campaign.name} `, {
        tonicCampaignId: campaign.tonicCampaignId,
        tonicTrackingLink: campaign.tonicTrackingLink || undefined,
        platformCount: campaign.platforms.length,
        mediaCount: campaign.media.length,
      });

      // Prepare AI content structure (keywords and copy master are already in campaign)
      const aiContentResult = {
        copyMaster: campaign.copyMaster || '',
        keywords: campaign.keywords || [],
        article: campaign.tonicArticleId ? { headlineId: campaign.tonicArticleId } : undefined,
      };

      // Update status to LAUNCHING
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.LAUNCHING },
      });

      // Launch to each platform
      const platformResults = [];

      for (const platformConfig of campaign.platforms) {
        try {
          logger.info('system', `Launching to ${platformConfig.platform}...`);

          // Convert database platform config to the format expected by launch methods
          const platformParams = {
            platform: platformConfig.platform,
            accountId: platformConfig.metaAccountId || platformConfig.tiktokAccountId || '',
            performanceGoal: platformConfig.performanceGoal,
            budget: platformConfig.budget,
            startDate: platformConfig.startDate,
            generateWithAI: platformConfig.generateWithAI,
          };

          if (platformConfig.platform === Platform.META) {
            const result = await this.launchToMeta(campaign, platformParams, aiContentResult);
            platformResults.push(result);
          } else if (platformConfig.platform === Platform.TIKTOK) {
            const result = await this.launchToTikTok(campaign, platformParams, aiContentResult);
            platformResults.push(result);
          }
        } catch (error: any) {
          logger.error('system', `Error launching to ${platformConfig.platform}: ${error.message} `, {
            platform: platformConfig.platform,
            error: error.message,
            stack: error.stack,
          });
          errors.push(`${platformConfig.platform}: ${error.message} `);
          platformResults.push({
            platform: platformConfig.platform,
            success: false,
            error: error.message,
          });
        }
      }

      // Update final status
      const allSuccessful = platformResults.every((r) => r.success);

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: allSuccessful ? CampaignStatus.ACTIVE : CampaignStatus.FAILED,
          launchedAt: new Date(),
        },
      });

      logger.success('system', `Campaign launch complete! Status: ${allSuccessful ? 'ACTIVE' : 'FAILED'} `, {
        campaignId,
        platforms: platformResults.map(p => ({ platform: p.platform, success: p.success })),
      });

      return {
        success: allSuccessful,
        campaignId,
        tonicCampaignId: campaign.tonicCampaignId,
        tonicTrackingLink: campaign.tonicTrackingLink || undefined,
        platforms: platformResults,
        aiContent: aiContentResult,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      logger.error('system', `Failed to launch campaign to platforms: ${error.message} `, {
        campaignId,
        error: error.message,
        stack: error.stack,
      });

      // Update campaign status to FAILED
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.FAILED },
      });

      throw new Error(`Failed to launch campaign to platforms: ${error.message} `);
    }
  }
}

// Export singleton instance
export const campaignOrchestrator = new CampaignOrchestratorService();
export default campaignOrchestrator;
