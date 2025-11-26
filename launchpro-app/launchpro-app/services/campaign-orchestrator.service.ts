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
import sharp from 'sharp';



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
    specialAdCategories?: string[];
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
              tonicAccount: params.tonicAccountId ? { connect: { id: params.tonicAccountId } } : undefined,
              metaAccount: p.platform === Platform.META && p.accountId ? { connect: { id: p.accountId } } : undefined,
              tiktokAccount: p.platform === Platform.TIKTOK && p.accountId ? { connect: { id: p.accountId } } : undefined,
              performanceGoal: p.performanceGoal,
              budget: p.budget,
              startDate: p.startDate,
              generateWithAI: p.generateWithAI,
              specialAdCategories: p.specialAdCategories || [],
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
            teaser: '', // User requested teaser to be empty (auto-completes)
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

        // CRITICAL: User requires "Direct Link" (site=direct).
        // The standard tracking link (e.g., 12345.track.com) is NOT the direct link.
        // We must fetch the campaign list to get the 'direct_link' field.
        try {
          logger.info('tonic', '🔍 Fetching campaign list to get "Direct Link"...');
          const campaignList = await tonicService.getCampaignList(credentials, 'active');

          // Find our campaign in the list
          // Note: Tonic IDs might be numbers or strings
          const tonicCampaign = campaignList.find((c: any) => c.id == tonicCampaignId);

          if (tonicCampaign && tonicCampaign.direct_link) {
            trackingLink = tonicCampaign.direct_link;
            logger.success('tonic', `✅ Found Direct Link: ${trackingLink}`);
          } else {
            logger.warn('tonic', '⚠️  Direct Link not found in campaign list. Using regular tracking link.', {
              foundCampaign: !!tonicCampaign,
              hasDirectLink: !!tonicCampaign?.direct_link
            });
          }
        } catch (error: any) {
          logger.warn('tonic', `⚠️  Failed to fetch campaign list for Direct Link: ${error.message}. Using regular tracking link.`);
        }

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

            // Get pixel ID and access token from DB
            const pixelId = metaAccount.metaPixelId;
            let accessToken = metaAccount.metaAccessToken;

            if (!pixelId) {
              throw new Error(
                `No pixel ID found for Meta account "${metaAccount.name}". ` +
                `Please configure it in the Account settings.`
              );
            }

            // FALLBACK: If account doesn't have access token, use global settings
            if (!accessToken) {
              logger.warn('meta', `⚠️  No access token in account "${metaAccount.name}". Trying global settings...`);

              const globalSettings = await prisma.globalSettings.findUnique({
                where: { id: 'global-settings' },
              });

              accessToken = globalSettings?.metaAccessToken;

              if (!accessToken) {
                // Final fallback to environment variable
                accessToken = env.META_ACCESS_TOKEN;
              }

              if (accessToken) {
                logger.info('meta', `✅ Using global Meta access token for account "${metaAccount.name}"`);
              } else {
                throw new Error(
                  `No access token found for Meta account "${metaAccount.name}". ` +
                  `Please configure it in the Account settings, Global Settings, or .env file.`
                );
              }
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
            // Get TikTok account to fetch pixel ID and access token
            const tiktokAccount = await prisma.account.findUnique({
              where: { id: platformConfig.accountId },
            });

            if (!tiktokAccount) {
              throw new Error(`TikTok account ${platformConfig.accountId} not found`);
            }

            let pixelId = tiktokAccount.tiktokPixelId;
            let accessToken = tiktokAccount.tiktokAccessToken;

            // FALLBACK: If account doesn't have access token, use global settings
            if (!accessToken) {
              logger.warn('tiktok', `⚠️  No access token in account "${tiktokAccount.name}". Trying global settings...`);

              const globalSettings = await prisma.globalSettings.findUnique({
                where: { id: 'global-settings' },
              });

              accessToken = globalSettings?.tiktokAccessToken;

              if (!accessToken) {
                // Final fallback to environment variable
                accessToken = env.TIKTOK_ACCESS_TOKEN;
              }

              if (accessToken) {
                logger.info('tiktok', `✅ Using global TikTok access token for account "${tiktokAccount.name}"`);
              } else {
                throw new Error(
                  `No access token found for TikTok account "${tiktokAccount.name}". ` +
                  `Please configure it in the Account settings, Global Settings, or .env file.`
                );
              }
            }

            // AUTO-FETCH PIXEL ID: If not configured, try to fetch from TikTok API
            if (!pixelId) {
              logger.warn('tiktok', `⚠️  No pixel ID configured for TikTok account "${tiktokAccount.name}". Attempting auto-fetch...`);

              try {
                const tiktokService = (await import('./tiktok.service')).default;
                const pixels = await tiktokService.listPixels(
                  tiktokAccount.tiktokAdvertiserId || undefined,
                  accessToken
                );

                if (pixels && pixels.length > 0) {
                  pixelId = pixels[0].pixel_id;
                  logger.info('tiktok', `✅ Auto-fetched pixel ID: ${pixelId} for account "${tiktokAccount.name}"`);

                  // Save to database for future use
                  await prisma.account.update({
                    where: { id: tiktokAccount.id },
                    data: { tiktokPixelId: pixelId },
                  });

                  logger.success('tiktok', `💾 Saved pixel ID ${pixelId} to database for account "${tiktokAccount.name}"`);
                } else {
                  throw new Error(
                    `No pixels found for TikTok account "${tiktokAccount.name}" (Advertiser ID: ${tiktokAccount.tiktokAdvertiserId}). ` +
                    `Please create a pixel in your TikTok Ads Manager or configure it manually in the Account settings.`
                  );
                }
              } catch (fetchError: any) {
                logger.error('tiktok', `❌ Failed to auto-fetch pixel ID:`, fetchError.message);
                throw new Error(
                  `No pixel ID found for TikTok account "${tiktokAccount.name}". ` +
                  `Auto-fetch failed: ${fetchError.message}. ` +
                  `Please configure it in the Account settings.`
                );
              }
            }

            logger.info('tonic', `Configuring TikTok pixel ${pixelId} for campaign ${tonicCampaignId}...`);

            await tonicService.createPixel(credentials, 'tiktok', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              pixel_id: pixelId, // REQUIRED
              access_token: accessToken, // REQUIRED
              revenue_type: 'preestimated_revenue',
            });

            logger.success('tonic', `✅ TikTok pixel ${pixelId} configured for campaign ${tonicCampaignId}`);
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
              const result = await this.launchToMeta(campaign, platformConfig, aiContentResult, tonicCampaignId?.toString());
              platformResults.push(result);
            } else if (platformConfig.platform === Platform.TIKTOK) {
              const result = await this.launchToTikTok(
                campaign,
                platformConfig,
                aiContentResult,
                tonicCampaignId?.toString()
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
   * Format Tonic Link with required parameters
   * 
   * Requirements:
   * - Use "Direct Link" (site=direct)
   * - Append parameters: network, site, adtitle, ad_id, dpco
   */
  private formatTonicLink(baseLink: string, platform: 'META' | 'TIKTOK', copyMaster: string): string {
    if (!baseLink) return '';

    // Check if it's already a direct link (usually contains 'articles' or 'dest=')
    // If not, we might be using the regular tracking link, but we'll still apply params

    const url = new URL(baseLink);

    // 1. network
    url.searchParams.set('network', platform === 'META' ? 'facebook' : 'tiktok');

    // 2. site (always 'direct' as requested)
    url.searchParams.set('site', 'direct');

    // 3. adtitle (Copy Master) - Clean and set
    if (copyMaster && copyMaster.trim()) {
      // Truncate if too long and clean for URL
      const safeTitle = copyMaster
        .substring(0, 100)
        .trim()
        .replace(/\n/g, ' ')  // Replace newlines with spaces
        .replace(/\s+/g, ' '); // Collapse multiple spaces
      url.searchParams.set('adtitle', safeTitle);
      logger.info('tonic', `Setting adtitle: "${safeTitle}"`);
    } else {
      logger.warn('tonic', 'Copy Master is empty, adtitle will not be set');
    }

    // 4. ad_id (Platform Macro)
    // Meta: {{ad.id}}
    // TikTok: __AID__ (Ad ID)
    const adIdMacro = platform === 'META' ? '{{ad.id}}' : '__AID__';
    url.searchParams.set('ad_id', adIdMacro);

    // 5. dpco (Always 1)
    url.searchParams.set('dpco', '1');

    return url.toString();
  }

  /**
   * Launch campaign to Meta (Facebook/Instagram)
   *
   * Supports both images and videos according to Meta Ads API documentation:
   * - Images: JPG, PNG, max 30MB, recommended 1:1 aspect ratio
   * - Videos: MP4, MOV, max 4GB, 1-241 min duration
   */
  private async launchToMeta(campaign: any, platformConfig: any, aiContent: any, tonicCampaignId?: string) {
    // Build campaign name with Tonic ID prefix (format: {tonicId}_{campaignName})
    const fullCampaignName = tonicCampaignId ? `${tonicCampaignId}_${campaign.name}` : campaign.name;

    // Helper to get tomorrow's date in YYYY-MM-DD format for Ad names
    const getTomorrowDate = (): string => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0]; // "2025-11-27"
    };

    logger.info('meta', 'Creating Meta campaign...', { campaignName: fullCampaignName, originalName: campaign.name, tonicId: tonicCampaignId });

    // Fetch the Meta Account to get the correct Ad Account ID
    const metaAccount = await prisma.account.findUnique({
      where: { id: platformConfig.accountId },
    });

    if (!metaAccount || !metaAccount.metaAdAccountId) {
      throw new Error(`Meta account not found or missing Ad Account ID for config ID: ${platformConfig.accountId}`);
    }

    const adAccountId = metaAccount.metaAdAccountId;
    let accessToken = metaAccount.metaAccessToken;

    // FALLBACK: If account doesn't have access token, use global settings
    if (!accessToken) {
      logger.warn('meta', `⚠️  No access token in account "${metaAccount.name}". Trying global settings...`);

      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });

      accessToken = globalSettings?.metaAccessToken;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = env.META_ACCESS_TOKEN;
      }

      if (accessToken) {
        logger.info('meta', `✅ Using global Meta access token for account "${metaAccount.name}"`);
      } else {
        throw new Error(
          `No access token found for Meta account "${metaAccount.name}". ` +
          `Please configure it in the Account settings, Global Settings, or .env file.`
        );
      }
    }

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
    const metaCampaign = await metaService.createCampaign({
      name: fullCampaignName,
      objective: 'OUTCOME_SALES', // Required for Purchase conversion event
      status: 'PAUSED', // Always create as paused first
      special_ad_categories: platformConfig.specialAdCategories && platformConfig.specialAdCategories.length > 0
        ? platformConfig.specialAdCategories
        : ['NONE'],
      // CBO: Set budget at campaign level
      // ABO: Do NOT set budget at campaign level
      daily_budget: isCBO ? budgetInCents : undefined,
      bid_strategy: isCBO ? 'LOWEST_COST_WITHOUT_CAP' : undefined,
    }, adAccountId, accessToken);

    logger.success('meta', `Meta campaign created with ID: ${metaCampaign.id}`);

    // Get Pixel ID for this account
    const pixelId = metaAccount.metaPixelId || '878273167774607'; // Fallback to default if not found
    logger.info('meta', `Using Pixel ID: ${pixelId} for Account: ${adAccountId}`);

    // Generate targeting suggestions from AI
    logger.info('meta', 'Generating AI targeting suggestions...');
    const targetingSuggestions = await aiService.generateTargetingSuggestions({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'META',
    });

    logger.info('meta', 'AI Targeting Suggestions:', targetingSuggestions);

    // Process Interests (Search for IDs)
    const targetInterests: Array<{ id: string; name: string }> = [];
    if (targetingSuggestions.interests) {
      for (const interest of targetingSuggestions.interests) {
        try {
          const searchResults = await metaService.searchTargetingInterests(interest);
          if (searchResults.data && searchResults.data.length > 0) {
            // Use the first match
            const match = searchResults.data[0];
            targetInterests.push({ id: match.id, name: match.name });
          }
        } catch (err) {
          logger.warn('meta', `Failed to search interest "${interest}"`, { error: err });
        }
      }
    }

    // Process Behaviors (Search for IDs)
    const targetBehaviors: Array<{ id: string; name: string }> = [];
    if (targetingSuggestions.behaviors) {
      for (const behavior of targetingSuggestions.behaviors) {
        try {
          const searchResults = await metaService.searchTargetingBehaviors(behavior);
          if (searchResults.data && searchResults.data.length > 0) {
            // Use the first match
            const match = searchResults.data[0];
            targetBehaviors.push({ id: match.id, name: match.name });
          }
        } catch (err) {
          logger.warn('meta', `Failed to search behavior "${behavior}"`, { error: err });
        }
      }
    }

    // Process Age
    let ageMin = 18;
    let ageMax = 65;
    if (targetingSuggestions.ageGroups && targetingSuggestions.ageGroups.length > 0) {
      // Parse first group (e.g., "25-45" or "18+")
      const firstGroup = targetingSuggestions.ageGroups[0];
      const parts = firstGroup.match(/(\d+)/g);
      if (parts && parts.length > 0) {
        ageMin = parseInt(parts[0]);
        if (parts.length > 1) {
          ageMax = parseInt(parts[1]);
        }
      }
    }

    // Process Language (Locales)
    // Map common language codes to Meta Locale IDs
    // 6 = Spanish (All), 1001 = English (US), etc.
    // See: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search/
    logger.info('meta', `=== LANGUAGE DEBUG ===`);
    logger.info('meta', `campaign.language raw value: "${campaign.language}"`);
    logger.info('meta', `campaign.language type: ${typeof campaign.language}`);

    // Meta Locale IDs for targeting:
    // For Spanish, we use multiple locale IDs to ensure Meta recognizes the targeting:
    // 6 = Spanish (All), 23 = Spanish (Latin America), 24 = Spanish (Spain)
    // Reference: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search/
    const localeMap: Record<string, number[]> = {
      'es': [6, 23, 24], // Spanish - include all Spanish variants
      'en': [1001], // English (US)
      'pt': [1002], // Portuguese (Brazil)
      'fr': [9], // French (All)
      'de': [7], // German (All)
      // Full names (from dropdown)
      'español': [6, 23, 24], // Spanish - include all Spanish variants
      'spanish': [6, 23, 24], // Spanish - include all Spanish variants
      'english': [1001],
      'inglés': [1001],
      'portuguese': [1002],
      'portugués': [1002],
      'french': [9],
      'francés': [9],
      'german': [7],
      'alemán': [7],
    };

    // Normalize language input (lowercase, trim)
    const normalizedLang = campaign.language ? campaign.language.toLowerCase().trim() : 'en';
    const targetLocales = localeMap[normalizedLang] || undefined;

    logger.info('meta', `Normalized language: "${normalizedLang}"`);
    logger.info('meta', `Locale lookup result: ${JSON.stringify(targetLocales)}`);

    if (!targetLocales) {
      logger.warn('meta', `No locale mapping found for language "${campaign.language}" (normalized: "${normalizedLang}"). Targeting all languages.`);
    } else {
      logger.info('meta', `✅ Targeting locales: ${JSON.stringify(targetLocales)} for language "${campaign.language}"`);
    }
    logger.info('meta', `=== END LANGUAGE DEBUG ===`);

    // Build targeting object - only include locales if we have a valid value
    const targetingSpec: any = {
      geo_locations: {
        countries: [campaign.country], // Use campaign country
      },
      age_min: ageMin,
      age_max: ageMax,
      publisher_platforms: ['facebook', 'instagram', 'messenger'], // Explicitly set platforms
    };

    // Only add optional targeting if they have values
    if (targetInterests.length > 0) {
      targetingSpec.interests = targetInterests;
    }
    if (targetBehaviors.length > 0) {
      targetingSpec.behaviors = targetBehaviors;
    }
    // IMPORTANT: Only add locales if we have a valid array with values
    if (targetLocales && targetLocales.length > 0) {
      targetingSpec.locales = targetLocales;
      logger.info('meta', `✅ Adding locales to targeting: ${JSON.stringify(targetLocales)}`);
    } else {
      logger.warn('meta', `⚠️ No locales to add - targeting will use all languages`);
    }

    logger.info('meta', `=== TARGETING SPEC BEING SENT ===`);
    logger.info('meta', JSON.stringify(targetingSpec, null, 2));
    logger.info('meta', `=== END TARGETING SPEC ===`);

    // Create Ad Set (according to Meta Ads API)
    const adSet = await metaService.createAdSet({
      campaign_id: metaCampaign.id,
      name: `${fullCampaignName} - AdSet`,
      optimization_goal: 'OFFSITE_CONVERSIONS', // Correct goal for Website Leads (Pixel)
      billing_event: 'IMPRESSIONS', // Standard for lead gen

      // ABO Logic: Set budget and bid strategy at Ad Set level if NOT CBO
      daily_budget: !isCBO ? budgetInCents : undefined,
      bid_strategy: !isCBO ? 'LOWEST_COST_WITHOUT_CAP' : undefined,

      start_time: new Date(platformConfig.startDate).toISOString(),
      targeting: targetingSpec,
      status: 'PAUSED',
      promoted_object: {
        pixel_id: pixelId,
        custom_event_type: 'PURCHASE',
      },
    }, adAccountId, accessToken);

    logger.success('meta', `Meta ad set created with ID: ${adSet.id}`);
    let imageHash: string | undefined;
    let videoId: string | undefined;

    // Validation: Video ads require at least one image for thumbnail
    if (useVideo && images.length === 0) {
      throw new Error(
        'Meta requires a thumbnail image for video ads. Please upload at least one image along with your video.'
      );
    }

    if (useVideo) {
      // UPLOAD VIDEO
      const video = videos[0];
      logger.info('meta', `Uploading video to Meta: ${video.fileName}`);

      const axios = require('axios');
      const videoResponse = await axios.get(video.url, { responseType: 'arraybuffer' });
      const videoBuffer = Buffer.from(videoResponse.data);

      videoId = await metaService.uploadVideo(videoBuffer, video.fileName, adAccountId, accessToken);

      await prisma.media.update({
        where: { id: video.id },
        data: { usedInMeta: true },
      });

      logger.success('meta', `Video uploaded successfully to Meta`, { videoId });

      // UPLOAD THUMBNAIL (using first image)
      const thumbnailImage = images[0];
      logger.info('meta', `Uploading thumbnail image for video: ${thumbnailImage.fileName}`);

      const thumbnailResponse = await axios.get(thumbnailImage.url, { responseType: 'arraybuffer' });
      const thumbnailBuffer = Buffer.from(thumbnailResponse.data);

      imageHash = await metaService.uploadImage(thumbnailBuffer, thumbnailImage.fileName, adAccountId, accessToken);

      await prisma.media.update({
        where: { id: thumbnailImage.id },
        data: {
          usedInMeta: true,
          metaHash: imageHash,
        },
      });

      logger.success('meta', `Thumbnail uploaded successfully to Meta`, { imageHash });

    } else {
      // UPLOAD IMAGE
      const image = images[0];
      logger.info('meta', `Uploading image to Meta: ${image.fileName}`);

      const axios = require('axios');
      const response = await axios.get(image.url, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(response.data);

      imageHash = await metaService.uploadImage(imageBuffer, image.fileName, adAccountId, accessToken);

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
      throw new Error(`Meta Page ID not found for account ${metaAccount.name}.Please configure it in the Account settings.`);
    }

    // Instagram Identity: Not specifying any Instagram ID
    // Meta will automatically use "Use Facebook Page as Instagram" option
    logger.info('meta', `Instagram identity: Using Facebook Page as Instagram (no instagram_user_id specified)`);

    // FORMAT TONIC LINK
    const finalLink = this.formatTonicLink(
      campaign.tonicTrackingLink || 'https://example.com',
      'META',
      aiContent.copyMaster
    );

    logger.info('meta', `Using formatted Tonic link: ${finalLink} `);

    const creative = await metaService.createAdCreative({
      name: `${campaign.name} - Creative`,
      object_story_spec: {
        page_id: metaAccount.metaPageId,
        // No instagram_user_id - Meta will use "Use Facebook Page as Instagram" automatically
        ...(useVideo ? {
          video_data: {
            video_id: videoId!,
            image_hash: imageHash!,  // Thumbnail required for video ads
            title: adCopy.headline,
            message: adCopy.primaryText,
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: finalLink },
            },
          },
        } : {
          link_data: {
            link: finalLink,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            image_hash: imageHash!,
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: finalLink },
            },
          },
        }),
      },
    }, adAccountId, accessToken);

    logger.success('meta', `Meta creative created with ID: ${creative.id} `);

    // Create Ad (according to Meta Ads API)
    // Ad name uses tomorrow's date in YYYY-MM-DD format
    const ad = await metaService.createAd({
      name: getTomorrowDate(),
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: 'PAUSED',
    }, adAccountId, accessToken);

    logger.success('meta', `Meta ad created with ID: ${ad.id} `);

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
   * Process image for TikTok Ads API
   *
   * CRITICAL: TikTok only supports SPECIFIC image sizes for SINGLE_IMAGE ads:
   * - 720x1280 (9:16 vertical) - Recommended for in-feed ads
   * - 1200x628 (16:9 horizontal) - For news feed/Pangle
   * - 640x640 (1:1 square) - Universal
   *
   * Images with non-standard sizes (like 896x1280) will be REJECTED with
   * "Unsupported image size" error even if the aspect ratio is correct!
   */
  private async processTikTokImage(imageBuffer: Buffer): Promise<Buffer> {
    const metadata = await sharp(imageBuffer).metadata();
    logger.info('tiktok', `Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    const originalWidth = metadata.width || 0;
    const originalHeight = metadata.height || 0;

    if (originalWidth < 40 || originalHeight < 40) {
      throw new Error(`Image too small: ${originalWidth}x${originalHeight}. Minimum is 40x40px`);
    }

    // Calculate aspect ratio to determine best target size
    const aspectRatio = originalWidth / originalHeight;

    // Determine target dimensions based on aspect ratio
    // TikTok ONLY supports these exact sizes for SINGLE_IMAGE ads
    let targetWidth: number;
    let targetHeight: number;

    if (aspectRatio <= 0.75) {
      // Vertical (portrait) - use 720x1280 (9:16 = 0.5625)
      // Catches images like 896x1280 (AR: 0.70) which are clearly vertical
      targetWidth = 720;
      targetHeight = 1280;
      logger.info('tiktok', `Detected vertical image (AR: ${aspectRatio.toFixed(2)}), resizing to 720x1280 (9:16)`);
    } else if (aspectRatio >= 1.4) {
      // Horizontal (landscape) - use 1200x628 (16:9 = 1.91)
      targetWidth = 1200;
      targetHeight = 628;
      logger.info('tiktok', `Detected horizontal image (AR: ${aspectRatio.toFixed(2)}), resizing to 1200x628 (16:9)`);
    } else {
      // Square-ish (0.75 < AR < 1.4) - use 640x640 (1:1)
      targetWidth = 640;
      targetHeight = 640;
      logger.info('tiktok', `Detected square-ish image (AR: ${aspectRatio.toFixed(2)}), resizing to 640x640 (1:1)`);
    }

    // Resize to exact TikTok dimensions and convert to JPEG
    const processedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        fit: 'cover',      // Crop to fill exact dimensions
        position: 'center' // Center the crop
      })
      .jpeg({
        quality: 90,
        mozjpeg: true,
      })
      .toBuffer();

    // Verify the result
    const processedMeta = await sharp(processedBuffer).metadata();
    logger.info('tiktok', `Processed image: ${processedMeta.width}x${processedMeta.height}, ` +
      `size: ${(processedBuffer.length / 1024).toFixed(2)}KB`);

    return processedBuffer;
  }

  /**
   * Launch campaign to TikTok
   *
   * Supports both images and videos according to TikTok Ads API documentation:
   * - Images: JPG, PNG, 50KB-500KB, recommended 9:16 aspect ratio
   * - Videos: MP4, MOV, MPEG, max 500MB, 5-60 sec, recommended 9:16 aspect ratio
   */
  private async launchToTikTok(campaign: any, platformConfig: any, aiContent: any, tonicCampaignId?: string) {
    // Build campaign name with Tonic ID prefix (format: {tonicId}_{campaignName})
    const fullCampaignName = tonicCampaignId ? `${tonicCampaignId}_${campaign.name}` : campaign.name;

    // Helper to get tomorrow's date in YYYY-MM-DD format for Ad names
    const getTomorrowDate = (): string => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0]; // "2025-11-27"
    };

    logger.info('tiktok', 'Creating TikTok campaign...', { campaignName: fullCampaignName, originalName: campaign.name, tonicId: tonicCampaignId });

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

    // Fetch the TikTok Account
    const tiktokAccount = await prisma.account.findUnique({
      where: { id: platformConfig.accountId },
    });

    if (!tiktokAccount || !tiktokAccount.tiktokAdvertiserId) {
      throw new Error(`TikTok account not found or missing Advertiser ID for config ID: ${platformConfig.accountId}`);
    }

    const advertiserId = tiktokAccount.tiktokAdvertiserId;
    let accessToken = tiktokAccount.tiktokAccessToken;

    // FALLBACK: If account doesn't have access token, use global settings
    if (!accessToken) {
      logger.warn('tiktok', `⚠️  No access token in account "${tiktokAccount.name}". Trying global settings...`);

      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });

      accessToken = globalSettings?.tiktokAccessToken;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = env.TIKTOK_ACCESS_TOKEN;
      }

      if (accessToken) {
        logger.info('tiktok', `✅ Using global TikTok access token for account "${tiktokAccount.name}"`);
      } else {
        throw new Error(
          `No access token found for TikTok account "${tiktokAccount.name}". ` +
          `Please configure it in the Account settings, Global Settings, or .env file.`
        );
      }
    }

    // Create Campaign (according to TikTok Ads API - TRAFFIC objective for website visits)
    // Note: TRAFFIC supports both SINGLE_IMAGE and SINGLE_VIDEO formats
    // LEAD_GENERATION only supports SINGLE_VIDEO for in-feed placements
    // IMPORTANT: Campaign is created in PAUSED status to allow review before spending budget
    //
    // BUDGET UNITS (TikTok API uses DOLLARS, not cents!):
    // - platformConfig.budget: Value from UI in DOLLARS (e.g., "50" means $50)
    // - TikTok API budget: Also in DOLLARS (e.g., 50 for $50)
    // - TikTok minimum daily budget: $50 USD
    const budgetInDollars = parseInt(platformConfig.budget);

    logger.info('tiktok', `Campaign budget: $${budgetInDollars} USD`);

    const tiktokCampaign = await tiktokService.createCampaign({
      advertiser_id: advertiserId,
      campaign_name: fullCampaignName,
      objective_type: 'TRAFFIC', // TRAFFIC supports image ads, LEAD_GENERATION does NOT
      budget_mode: 'BUDGET_MODE_DAY',
      budget: budgetInDollars, // TikTok API expects budget in DOLLARS (not cents!)
      operation_status: 'DISABLE', // DISABLE = paused, ENABLE = active
    }, accessToken);

    logger.success('tiktok', `TikTok campaign created with ID: ${tiktokCampaign.campaign_id} `);

    // Generate targeting suggestions from AI
    logger.info('tiktok', 'Generating AI targeting suggestions...');
    const targetingSuggestions = await aiService.generateTargetingSuggestions({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
    });

    // Map Age Groups to TikTok Enums
    // TikTok Age Groups: AGE_13_17, AGE_18_24, AGE_25_34, AGE_35_44, AGE_45_54, AGE_55_64, AGE_65_PLUS
    const tiktokAgeGroups: string[] = [];

    if (targetingSuggestions.ageGroups && targetingSuggestions.ageGroups.length > 0) {
      // Parse first group (e.g., "25-45" or "18+")
      const firstGroup = targetingSuggestions.ageGroups[0];
      const parts = firstGroup.match(/(\d+)/g);

      if (parts && parts.length > 0) {
        const ageMin = parseInt(parts[0]);
        const ageMax = parts.length > 1 ? parseInt(parts[1]) : 100;

        if (ageMin <= 17) tiktokAgeGroups.push('AGE_13_17');
        if (ageMin <= 24 && ageMax >= 18) tiktokAgeGroups.push('AGE_18_24');
        if (ageMin <= 34 && ageMax >= 25) tiktokAgeGroups.push('AGE_25_34');
        if (ageMin <= 44 && ageMax >= 35) tiktokAgeGroups.push('AGE_35_44');
        if (ageMin <= 54 && ageMax >= 45) tiktokAgeGroups.push('AGE_45_54');
        if (ageMin <= 64 && ageMax >= 55) tiktokAgeGroups.push('AGE_55_64');
        if (ageMax >= 65) tiktokAgeGroups.push('AGE_65_PLUS');
      }
    }

    // Note: Interest mapping for TikTok requires Category IDs which are complex to map without fuzzy search.
    // We are skipping interest mapping for now and relying on broad targeting + pixel optimization.

    // Get Location ID for TikTok
    let locationId: string;
    try {
      locationId = await tiktokService.getLocationId(campaign.country);
      logger.info('tiktok', `Resolved location ID for ${campaign.country}: ${locationId}`);
    } catch (error: any) {
      logger.warn('tiktok', `Failed to resolve location ID for ${campaign.country}. Using default/fallback if available, or erroring out.`, { error: error.message });
      throw error;
    }

    // Create Ad Group (according to TikTok Ads API)
    // Calculate end date (30 days from start date for default)
    let startDate = new Date(platformConfig.startDate);
    const now = new Date();

    // TikTok requires start time to be in the future (at least slightly)
    // If start date is in the past or within next 10 mins, set to 15 mins from now
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    if (startDate < tenMinutesFromNow) {
      logger.info('tiktok', `⚠️ Start date ${startDate.toISOString()} is in the past or too soon. Adjusting to 15 mins from now.`);
      startDate = new Date(now.getTime() + 15 * 60 * 1000);
    }

    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 30);

    // Calculate bid price based on budget
    // For TRAFFIC/CPC campaigns, bid is the cost per click IN DOLLARS
    // TikTok CPC API expects bid in dollars with decimal, e.g., 0.50 for $0.50
    //
    // BID UNITS (all in DOLLARS for TikTok API):
    // - For CPC: bid_price is in DOLLARS (e.g., 0.50 means $0.50 per click)
    // - For OCPM/CPM: bid_price is in DOLLARS (e.g., 5.00 means $5.00 per 1000 impressions)
    const targetClicksPerDay = 10; // Conservative target for optimization
    let bidPrice = budgetInDollars / targetClicksPerDay;

    // Ensure minimum bid of $0.50 for CPC (TikTok minimum is ~$0.01, but $0.50 is more realistic)
    bidPrice = Math.max(bidPrice, 0.50);

    // Debug logging to understand the values
    logger.info('tiktok', `Ad Group Configuration:`, {
      budgetInDollars,
      bidPriceInDollars: bidPrice,
      pixelId: platformConfig.pixelId || 'none'
    });

    // Create Ad Group parameters object
    // For TRAFFIC objective, we use WEBSITE promotion_type and CLICK optimization
    //
    // CRITICAL: TikTok PLACEMENT_TIKTOK (in-feed) only supports SINGLE_VIDEO format!
    // For SINGLE_IMAGE ads, we must use:
    // - PLACEMENT_PANGLE (partner network) - supports images
    // - Or PLACEMENT_TYPE_AUTOMATIC (TikTok decides)
    //
    // See: https://ads.tiktok.com/help/article/global-app-bundle-image-ad-specifications
    const adGroupParams: any = {
      advertiser_id: advertiserId,
      campaign_id: tiktokCampaign.campaign_id,
      adgroup_name: `${fullCampaignName} - Ad Group`,
      promotion_type: 'WEBSITE', // WEBSITE for traffic to external URL
      // Use automatic placement for images (Pangle supports images, TikTok in-feed does NOT)
      // For videos, we can use PLACEMENT_TIKTOK directly
      placement_type: useVideo ? 'PLACEMENT_TYPE_NORMAL' : 'PLACEMENT_TYPE_AUTOMATIC',
      ...(useVideo ? { placements: ['PLACEMENT_TIKTOK'] } : {}), // Only specify placements for videos
      schedule_type: 'SCHEDULE_START_END',
      schedule_start_time: startDate.toISOString().replace('T', ' ').split('.')[0],
      schedule_end_time: endDate.toISOString().replace('T', ' ').split('.')[0],
      budget_mode: 'BUDGET_MODE_DAY',
      budget: budgetInDollars, // TikTok API expects budget in DOLLARS (not cents!)
      optimization_goal: 'CLICK', // CLICK for TRAFFIC objective (supports images)
      billing_event: 'CPC', // Cost Per Click for traffic campaigns
      bid_type: 'BID_TYPE_CUSTOM', // Custom bidding with specified price
      bid_price: bidPrice, // CRITICAL: Field name is "bid_price", not "bid"
      location_ids: [locationId], // Use resolved Location ID
    };

    // Add optional fields only if they have values
    if (platformConfig.pixelId) {
      adGroupParams.pixel_id = platformConfig.pixelId;
    }
    if (tiktokAgeGroups.length > 0) {
      adGroupParams.age_groups = tiktokAgeGroups;
    }

    logger.info('tiktok', `Creating Ad Group with params:`, {
      ...adGroupParams
    });

    const adGroup = await tiktokService.createAdGroup(adGroupParams, accessToken);

    logger.success('tiktok', `TikTok ad group created with ID: ${adGroup.adgroup_id} `);

    // Upload media to TikTok
    let videoId: string | undefined;
    let imageIds: string[] = [];

    if (useVideo) {
      // UPLOAD VIDEO
      const video = videos[0]; // Use first video
      logger.info('tiktok', `Uploading video to TikTok: ${video.fileName} `);

      // Generate unique filename for video
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const uniqueFileName = video.fileName.replace(/\.[^/.]+$/, `_tiktok_${timestamp}_${randomString}$&`);

      // TikTok supports upload by URL (easier with signed URLs)
      const uploadResult = await tiktokService.uploadVideo({
        advertiser_id: advertiserId,
        upload_type: 'UPLOAD_BY_URL',
        video_url: video.url,
        file_name: uniqueFileName,
        auto_bind_enabled: true,
        auto_fix_enabled: true,
      }, accessToken);

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
      logger.info('tiktok', `Uploading image to TikTok: ${image.fileName}`);

      try {
        // Generate unique filename to avoid duplicates in TikTok Asset Library
        // Use .jpg extension since we convert to JPEG
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const uniqueFileName = image.fileName.replace(/\.[^/.]+$/, `_tiktok_${timestamp}_${randomString}.jpg`);

        // Download image from GCS
        logger.info('tiktok', `Downloading image from GCS: ${image.fileName}`);
        const axios = require('axios');
        const imageResponse = await axios.get(image.url, { responseType: 'arraybuffer' });
        const rawBuffer = Buffer.from(imageResponse.data);
        logger.info('tiktok', `Downloaded image, size: ${(rawBuffer.length / 1024).toFixed(2)}KB`);

        // CRITICAL: Re-procesar imagen para TikTok (normaliza formato, color profile, metadatos)
        const imageBuffer = await this.processTikTokImage(rawBuffer);
        logger.info('tiktok', `Uploading processed image to TikTok...`);

        const uploadResult = await tiktokService.uploadImage(
          imageBuffer, // Upload processed buffer
          uniqueFileName,
          'UPLOAD_BY_FILE',
          accessToken
        );

        imageIds = [uploadResult.image_id];
        logger.success('tiktok', `Image uploaded successfully to TikTok`, {
          imageId: imageIds[0],
          fileName: uniqueFileName,
          sizeKB: (imageBuffer.length / 1024).toFixed(2)
        });

      } catch (error: any) {
        logger.error('tiktok', `Failed to upload image: ${error.message}`);
        throw new Error(`TikTok image upload failed: ${error.message}`);
      }

      // Update media record
      await prisma.media.update({
        where: { id: image.id },
        data: { usedInTiktok: true },
      });

      // CRITICAL: Wait for TikTok to process the uploaded image
      // TikTok needs time to validate and process images before they can be used in ads
      logger.info('tiktok', '⏳ Waiting 15 seconds for TikTok to process the uploaded image...');
      await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds
    }

    // Get TikTok identity (required for ads)
    // DEFAULT: Use ADVERTISER identity (most common for API-created ads)
    let identityId = 'ADVERTISER';
    let identityType = 'ADVERTISER';

    // OPTIONAL: Try to get custom identities if available
    try {
      const identities = await tiktokService.getIdentities(advertiserId, accessToken);
      logger.info('tiktok', `Identities response: ${JSON.stringify(identities)}`);

      // Find an available CUSTOMIZED_USER identity
      const availableIdentity = identities.identity_list?.find((identity: any) => {
        return identity.identity_id && identity.identity_type === 'CUSTOMIZED_USER';
      });

      if (availableIdentity) {
        identityId = availableIdentity.identity_id;
        identityType = availableIdentity.identity_type;
        logger.info('tiktok', `Using custom TikTok identity: ${availableIdentity.display_name} (${identityId}, type: ${identityType})`);
      } else {
        logger.info('tiktok', `No custom identity found. Using default ADVERTISER identity.`);
      }
    } catch (identityError: any) {
      logger.warn('tiktok', `Failed to fetch identities: ${identityError.message}. Using default ADVERTISER identity.`);
    }

    // FORMAT TONIC LINK
    const finalLink = this.formatTonicLink(
      campaign.tonicTrackingLink || 'https://example.com',
      'TIKTOK',
      aiContent.copyMaster
    );

    logger.info('tiktok', `Using formatted Tonic link: ${finalLink} `);

    // Create Ad with retry logic for image processing delays
    logger.info('tiktok', 'Creating TikTok ad...');

    let ad: any;
    let adCreationAttempts = 0;
    const maxAdCreationAttempts = 3;
    const baseDelay = 20000; // 20 seconds base delay (increased from 10)

    while (adCreationAttempts < maxAdCreationAttempts) {
      try {
        // Ad name uses tomorrow's date in YYYY-MM-DD format
        ad = await tiktokService.createAd({
          advertiser_id: advertiserId,
          adgroup_id: adGroup.adgroup_id,
          ad_name: getTomorrowDate(),
          ad_format: useVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE',
          ad_text: adCopy.primaryText,
          call_to_action: adCopy.callToAction || 'LEARN_MORE',
          landing_page_url: finalLink,
          display_name: campaign.offer.name,
          ...(useVideo ? { video_id: videoId } : { image_ids: imageIds }),
          identity_id: identityId,
          identity_type: identityType, // Use the actual identity type from the API
        }, accessToken);

        logger.success('tiktok', `✅ TikTok ad created successfully with ID: ${ad.ad_id} `);
        break; // Success, exit the retry loop

      } catch (adError: any) {
        adCreationAttempts++;

        // Check if it's the "Unsupported image size" error and we have more attempts
        if (adError.message.includes('Unsupported image size') && adCreationAttempts < maxAdCreationAttempts) {
          const delay = baseDelay * Math.pow(2, adCreationAttempts - 1); // Exponential backoff: 10s, 20s, 40s

          logger.warn('tiktok',
            `⚠️ Image may still be processing in TikTok (attempt ${adCreationAttempts}/${maxAdCreationAttempts}). ` +
            `Waiting ${delay / 1000} seconds before retry...`, {
            error: adError.message,
            imageId: imageIds[0]
          });

          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          // Either not an image error or we've exhausted retries
          logger.error('tiktok', `Failed to create ad after ${adCreationAttempts} attempts`, {
            error: adError.message,
            finalImageId: imageIds[0]
          });
          throw adError;
        }
      }
    }

    if (!ad) {
      throw new Error('Failed to create TikTok ad after all retry attempts');
    }

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

      logger.info('system', `=== COPY MASTER DEBUG ===`);
      logger.info('system', `campaign.copyMaster from DB: "${campaign.copyMaster}"`);
      logger.info('system', `aiContentResult.copyMaster: "${aiContentResult.copyMaster}"`);
      logger.info('system', `=== END COPY MASTER DEBUG ===`);

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
            const result = await this.launchToMeta(campaign, platformParams, aiContentResult, campaign.tonicCampaignId);
            platformResults.push(result);
          } else if (platformConfig.platform === Platform.TIKTOK) {
            const result = await this.launchToTikTok(campaign, platformParams, aiContentResult, campaign.tonicCampaignId);
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
