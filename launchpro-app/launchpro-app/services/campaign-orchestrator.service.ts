import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import { env } from '@/lib/env';
import { tonicService } from './tonic.service';
import { metaService } from './meta.service';
import { tiktokService } from './tiktok.service';
import { aiService } from './ai.service';
import { getNeuralEngineOrchestrator } from './neural-engine';
import type { NeuralEngineInput, CreativePackage } from './neural-engine/types';
// NOTE: videoConverterService removed - TikTok requires direct video upload
import { waitForArticleApproval, formatElapsedTime } from '@/lib/article-polling';
import { waitForTrackingLink, formatPollingTime } from '@/lib/tracking-link-polling';
import { CampaignStatus, Platform, CampaignType, MediaType } from '@prisma/client';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { getStorageBucket } from '@/lib/gcs';
import { resolveCountryCodes, isWorldwide } from '@/lib/allowed-countries';

// ============================================================================
// NEURAL ENGINE FEATURE FLAG
// ============================================================================

/**
 * Check if Neural Engine is enabled
 * When enabled, uses 5-agent pipeline instead of traditional AI service
 */
function isNeuralEngineEnabled(): boolean {
  return env.ENABLE_NEURAL_ENGINE === 'true';
}

/**
 * Generate content using Neural Engine (when feature flag is enabled)
 * Returns content in a format compatible with the existing flow
 */
async function generateWithNeuralEngine(params: {
  offerId: string;
  offerName: string;
  offerVertical: string;
  offerDescription?: string;
  copyMaster?: string; // Manager's copy master - critical for image context
  country: string;
  language: string;
  platform: 'META' | 'TIKTOK';
}): Promise<{
  copyMaster: string;
  headlines: string[];
  primaryTexts: string[];
  descriptions: string[];
  images: Array<{ url: string; gcsPath: string }>;
} | null> {
  try {
    logger.info('ai', '[NeuralEngine] Generating content with Neural Engine...');
    if (params.copyMaster) {
      logger.info('ai', `[NeuralEngine] Using copyMaster for context: "${params.copyMaster}"`);
    }

    const orchestrator = getNeuralEngineOrchestrator();

    const input: NeuralEngineInput = {
      offer: {
        id: params.offerId,
        name: params.offerName,
        vertical: params.offerVertical,
        description: params.offerDescription,
      },
      country: params.country,
      language: params.language,
      platform: params.platform,
      copyMaster: params.copyMaster, // Pass to Neural Engine for image context
      useCache: true,
    };

    const result = await orchestrator.execute(input);

    if (!result.success || !result.data) {
      logger.warn('ai', '[NeuralEngine] Failed, falling back to traditional AI', {
        errors: result.errors,
      });
      return null;
    }

    const pkg = result.data;

    logger.success('ai', '[NeuralEngine] Content generated successfully', {
      imagesCount: pkg.visuals?.images?.length || 0,
      cacheHits: result.state.cacheHits.length,
      timeMs: result.state.timing.totalMs,
    });

    return {
      copyMaster: pkg.copy.copyMaster,
      headlines: [pkg.copy.headline],
      primaryTexts: [pkg.copy.primaryText],
      descriptions: [pkg.copy.description],
      images: (pkg.visuals?.images || []).map((img) => ({
        url: img.url,
        gcsPath: img.gcsPath,
      })),
    };
  } catch (error: any) {
    logger.error('ai', '[NeuralEngine] Error, falling back to traditional AI', {
      error: error.message,
    });
    return null;
  }
}



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
    aiMediaType?: 'IMAGE' | 'VIDEO' | 'BOTH'; // What type of media to generate (IMAGE for Meta, VIDEO for TikTok)
    aiMediaCount?: number; // How many media items to generate (1-5)
    adsPerAdSet?: number; // For ABO: How many ads to put in each ad set (1-5)
    specialAdCategories?: string[];
    // Fan Page for Meta (user selected in wizard)
    metaPageId?: string;
    // Identity for TikTok (user selected in wizard)
    tiktokIdentityId?: string;
    tiktokIdentityType?: string;
    // Manual Ad Copy (Meta only)
    manualAdCopy?: {
      adTitle?: string;
      description?: string;
      primaryText?: string;
    };
    // Manual Ad Copy (TikTok only)
    manualTiktokAdText?: string;
    // Taboola-specific settings
    taboolaBidStrategy?: 'FIXED' | 'MAX_CONVERSIONS' | 'TARGET_CPA' | 'ENHANCED_CPC';
    taboolaCpc?: number;
    taboolaBrandingText?: string;
  }[];

  // Manual keywords (optional, will be AI-generated if not provided)
  keywords?: string[];

  // Manual content generation phrases (optional, will be AI-generated if not provided)
  // Must be 3-5 phrases if provided
  contentGenerationPhrases?: string[];

  // RSOC article mode: 'new' creates a new article, 'existing' reuses an existing headline
  rsocMode?: 'new' | 'existing';

  // If rsocMode is 'existing', this is the headline_id to reuse
  selectedHeadlineId?: number | null;

  // Skip platform launch (for manual media upload workflow)
  skipPlatformLaunch?: boolean;

  // Owner - Manager ID who created this campaign
  createdById?: string;

  // DesignFlow configuration (used when article is approved by Tonic cron job)
  needsDesignFlow?: boolean;     // True = wait for DesignFlow, False = launch directly
  designFlowRequester?: string;  // Requester for DesignFlow task (Harry/Jesus/Milher)
  designFlowNotes?: string;      // Additional notes for design team
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
            const bucket = getStorageBucket();
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
      // Nota: El campaignLogger se inicializará después de obtener el campaignId
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

      // Log all offer fields from Tonic to debug vertical field name
      logger.info('tonic', 'Tonic offer data received:', {
        id: offer.id,
        name: offer.name,
        vertical: offer.vertical,
        category: offer.category,
        niche: offer.niche,
        offer_vertical: offer.offer_vertical,
        type: offer.type,
        allFields: Object.keys(offer),
      });

      // Tonic API may return vertical in different fields
      const offerVertical = offer.vertical || offer.category || offer.niche || offer.offer_vertical || offer.type || 'Unknown';

      if (!dbOffer) {
        dbOffer = await prisma.offer.create({
          data: {
            tonicId: params.offerId,
            name: offer.name,
            vertical: offerVertical,
          },
        });
        logger.info('system', 'Created new offer in database', { offerId: dbOffer.id, name: offer.name, vertical: offerVertical });
      } else if (dbOffer.vertical === 'Unknown' || dbOffer.vertical === 'General' || !dbOffer.vertical) {
        // Update existing offer if vertical is missing or generic
        dbOffer = await prisma.offer.update({
          where: { id: dbOffer.id },
          data: { vertical: offerVertical },
        });
        logger.info('system', 'Updated offer vertical in database', { offerId: dbOffer.id, vertical: offerVertical });
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
          createdById: params.createdById, // Owner - Manager who created this campaign
          offerId: dbOffer.id,
          country: params.country,
          language: params.language,
          copyMaster: params.copyMaster,
          communicationAngle: params.communicationAngle,
          keywords: params.keywords || [],
          contentGenerationPhrases: params.contentGenerationPhrases || [],
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
              aiMediaType: p.aiMediaType || (p.platform === Platform.TIKTOK ? 'VIDEO' : 'IMAGE'),
              aiMediaCount: Number(p.aiMediaCount) || 1,
              adsPerAdSet: Number(p.adsPerAdSet) || 1,
              specialAdCategories: p.specialAdCategories || [],
              status: CampaignStatus.DRAFT,
              // Manual Ad Copy (for Meta)
              manualAdTitle: p.manualAdCopy?.adTitle,
              manualDescription: p.manualAdCopy?.description,
              manualPrimaryText: p.manualAdCopy?.primaryText,
              // Manual Ad Copy (for TikTok)
              manualTiktokAdText: p.manualTiktokAdText,
              // User-selected Fan Page/Identity
              metaPageId: p.metaPageId,
              tiktokIdentityId: p.tiktokIdentityId,
              tiktokIdentityType: p.tiktokIdentityType,
            })),
          },
        },
        include: {
          platforms: true,
          offer: true,
        },
      });

      logger.success('system', `Campaign created with ID: ${campaign.id}`);

      // Inicializar campaignLogger para este campaignId
      campaignLogger.initialize(campaign.id);
      campaignLogger.startStep(campaign.id, 'validation', 'Validando configuración de campaña...');

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

      // Completar validación
      campaignLogger.completeStep(campaign.id, 'validation', 'Configuración validada correctamente');

      // ============================================
      // STEP 4: For RSOC, create article FIRST
      // ============================================
      let articleHeadlineId: number | undefined;

      if (campaignType === 'rsoc') {
        campaignLogger.startStep(campaign.id, 'tonic_article', 'Creando artículo en Tonic...');
        logger.info('ai', 'Generating article for RSOC campaign...');

        // Check if manual content generation phrases were provided (must be 3-5)
        const hasManualPhrases = params.contentGenerationPhrases &&
          params.contentGenerationPhrases.length >= 3 &&
          params.contentGenerationPhrases.length <= 5;

        let finalContentPhrases: string[];
        let articleHeadline: string;

        if (hasManualPhrases) {
          // Use manual phrases, still need to generate headline with AI
          logger.info('ai', `Using ${params.contentGenerationPhrases!.length} MANUAL content generation phrases`);
          finalContentPhrases = params.contentGenerationPhrases!;

          // Generate only headline with AI
          const articleContent = await aiService.generateArticle({
            offerName: offer.name,
            copyMaster: params.copyMaster || `Discover the best deals on ${offer.name}`,
            keywords: params.keywords || [],
            country: params.country,
            language: params.language,
          });
          articleHeadline = articleContent.headline;
        } else {
          // Generate everything with AI
          logger.info('ai', 'Generating article content with AI (no manual phrases provided)...');
          const articleContent = await aiService.generateArticle({
            offerName: offer.name,
            copyMaster: params.copyMaster || `Discover the best deals on ${offer.name}`,
            keywords: params.keywords || [],
            country: params.country,
            language: params.language,
          });
          finalContentPhrases = articleContent.contentGenerationPhrases;
          articleHeadline = articleContent.headline;
        }

        logger.info('ai', '📄 Article Content Ready:', {
          headline: articleHeadline,
          headlineLength: articleHeadline.length,
          phrasesCount: finalContentPhrases.length,
          phrases: finalContentPhrases,
          source: hasManualPhrases ? 'MANUAL' : 'AI',
        });

        logger.info('tonic', 'Creating article request in Tonic...');
        try {
          const articleRequestPayload = {
            offer_id: parseInt(params.offerId),
            country: params.country,
            language: params.language,
            domain: rsocDomain,
            content_generation_phrases: finalContentPhrases,
            headline: articleHeadline,
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
            campaignLogger.completeStep(campaign.id, 'tonic_article', 'Usando artículo existente');
            logger.success('tonic', `✅ Using EXISTING headline_id: ${articleHeadlineId}`, {
              headline: matchingHeadline.headline,
              offer: matchingHeadline.offer_name,
              country: matchingHeadline.country,
            });
          } else {
            // STRATEGY 2: Wait for the article we just created to be approved
            logger.warn('tonic', '⚠️  No existing approved headline found for this offer/country combination.');
            logger.info('tonic', `⏳ Will wait for article request #${articleRequestId} to be approved...`);

            // Log para el usuario
            campaignLogger.completeStep(campaign.id, 'tonic_article', 'Artículo creado en Tonic');
            campaignLogger.startStep(campaign.id, 'tonic_approval', 'Esperando aprobación del artículo...');

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
              campaignLogger.completeStep(campaign.id, 'tonic_approval', 'Artículo aprobado');
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
      campaignLogger.startStep(campaign.id, 'tonic_campaign', 'Creando campaña en Tonic...');

      // Use the exact campaign name provided by the user
      // This preserves Looker tracking compatibility (no suffixes that break tracking)
      // NOTE: If Tonic rejects the name as duplicate, the error will be thrown and
      // the user should use a different name or delete the old campaign first
      const tonicCampaignName = params.name;

      logger.info('tonic', `Creating ${campaignType.toUpperCase()} campaign in Tonic...`, {
        name: tonicCampaignName,
        country: params.country,
        offer: offer.name,
        type: campaignType,
        ...(articleHeadlineId && { headline_id: articleHeadlineId }),
      });

      try {
        const campaignParams = {
          name: tonicCampaignName,
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
      campaignLogger.completeStep(campaign.id, 'tonic_campaign', 'Campaña creada en Tonic');

      // Wait for tracking link to become available (campaign needs to be "active")
      // This typically takes 5-10 minutes after campaign creation
      campaignLogger.startStep(campaign.id, 'tracking_link', 'Obteniendo link de tracking...');
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
        campaignLogger.completeStep(campaign.id, 'tracking_link', 'Link de tracking obtenido');
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
      campaignLogger.startStep(campaign.id, 'keywords', 'Generando keywords con IA...');
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
      campaignLogger.completeStep(campaign.id, 'keywords', 'Keywords configurados');

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
      // Using UGC-style prompts based on user configuration
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

        // Get media type and count from platform config
        const mediaType = platformConfig.aiMediaType || (platformConfig.platform === 'TIKTOK' ? 'VIDEO' : 'IMAGE');
        const mediaCount = platformConfig.aiMediaCount || 1;

        // DEBUG: Log para verificar el valor de aiMediaCount
        logger.info('ai', `📊 DEBUG: Platform ${platformConfig.platform} - aiMediaCount from config: ${platformConfig.aiMediaCount}, resolved mediaCount: ${mediaCount}`);

        // TikTok only allows videos - enforce this
        const effectiveMediaType = platformConfig.platform === 'TIKTOK' ? 'VIDEO' : mediaType;

        logger.info('ai', `Generating UGC media for ${platformConfig.platform}: ${mediaCount}x ${effectiveMediaType}`);

        // Generate Ad Copy specific to platform (needed for text overlays)
        const adCopy = await aiService.generateAdCopy({
          offerName: offer.name,
          copyMaster: aiContentResult.copyMaster,
          platform: platformConfig.platform as 'META' | 'TIKTOK',
          adFormat: effectiveMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
          country: params.country,
          language: params.language,
        });

        // ============================================
        // NEURAL ENGINE INTEGRATION
        // ============================================
        let ugcMedia: { images: any[]; videos: any[] } = { images: [], videos: [] };
        let usedNeuralEngine = false;

        // Try Neural Engine first if enabled and generating images for META
        if (isNeuralEngineEnabled() && platformConfig.platform === 'META' && effectiveMediaType !== 'VIDEO') {
          logger.info('ai', '🧠 Neural Engine ENABLED - Using 5-agent pipeline for image generation');

          const neuralResult = await generateWithNeuralEngine({
            offerId: offer.id.toString(),
            offerName: offer.name,
            offerVertical: offer.vertical,
            offerDescription: offer.description || undefined,
            copyMaster: aiContentResult.copyMaster, // Critical: pass manager's copy for image context
            country: params.country,
            language: params.language,
            platform: platformConfig.platform as 'META' | 'TIKTOK',
          });

          if (neuralResult && neuralResult.images.length > 0) {
            logger.success('ai', `🧠 Neural Engine generated ${neuralResult.images.length} images`);
            usedNeuralEngine = true;
            ugcMedia = {
              images: neuralResult.images.map((img) => ({
                url: img.url,
                gcsPath: img.gcsPath,
                prompt: 'Neural Engine 5-agent pipeline',
              })),
              videos: [],
            };

            // Update copyMaster with Neural Engine's version if available
            if (neuralResult.copyMaster) {
              aiContentResult.copyMaster = neuralResult.copyMaster;
            }
          } else {
            logger.warn('ai', '🧠 Neural Engine failed or no images - falling back to traditional AI');
          }
        }

        // Fallback to traditional AI service if Neural Engine not used
        if (!usedNeuralEngine) {
          if (isNeuralEngineEnabled()) {
            logger.info('ai', '📷 Using traditional AI service (Neural Engine fallback or VIDEO mode)');
          }

          // Generate UGC-style media with custom prompts and vertical classification
          ugcMedia = await aiService.generateUGCMedia({
            campaignId: campaign.id,
            platform: platformConfig.platform as 'META' | 'TIKTOK',
            mediaType: effectiveMediaType as 'IMAGE' | 'VIDEO' | 'BOTH',
            count: mediaCount,
            category: offer.vertical || offer.name, // Use vertical as category, fallback to offer name
            country: params.country,
            language: params.language,
            adTitle: adCopy.headline, // Used for image text overlay
            copyMaster: aiContentResult.copyMaster, // Used for video text overlay
            offerName: offer.name, // Pass offer name for better vertical classification
            vertical: offer.vertical, // Pass vertical from Tonic for accurate template selection
          });
        }

        // Save generated images to database
        for (const image of ugcMedia.images) {
          await prisma.media.create({
            data: {
              campaignId: campaign.id,
              type: MediaType.IMAGE,
              generatedByAI: true,
              aiModel: 'imagen-4.0-fast-generate-001',
              aiPrompt: image.prompt,
              url: image.url,
              gcsPath: image.gcsPath,
              fileName: image.gcsPath.split('/').pop() || 'image.png',
              mimeType: 'image/png',
              usedInMeta: platformConfig.platform === 'META',
              usedInTiktok: false, // TikTok doesn't use images
            },
          });
          aiContentResult.media.images.push(image.url);
        }

        // Save generated videos to database (with thumbnails for Meta)
        for (const video of ugcMedia.videos) {
          // First create the video
          const videoMedia = await prisma.media.create({
            data: {
              campaignId: campaign.id,
              type: MediaType.VIDEO,
              generatedByAI: true,
              aiModel: 'veo-3.1-fast',
              aiPrompt: video.prompt,
              url: video.url,
              gcsPath: video.gcsPath,
              fileName: video.gcsPath.split('/').pop() || 'video.mp4',
              mimeType: 'video/mp4',
              duration: 5,
              usedInMeta: platformConfig.platform === 'META',
              usedInTiktok: platformConfig.platform === 'TIKTOK',
            },
          });

          aiContentResult.media.videos.push(video.url);

          // If Meta and has thumbnail, create thumbnail and link it
          if (platformConfig.platform === 'META' && video.thumbnailUrl && video.thumbnailGcsPath) {
            const thumbnailMedia = await prisma.media.create({
              data: {
                campaignId: campaign.id,
                type: MediaType.IMAGE,
                generatedByAI: true,
                aiModel: 'imagen-4.0-fast-generate-001',
                aiPrompt: `Thumbnail for video: ${video.prompt}`,
                url: video.thumbnailUrl,
                gcsPath: video.thumbnailGcsPath,
                fileName: video.thumbnailGcsPath.split('/').pop() || 'thumbnail.png',
                mimeType: 'image/png',
                usedInMeta: true,
              },
            });

            // Link thumbnail to video
            await prisma.media.update({
              where: { id: videoMedia.id },
              data: { thumbnailMediaId: thumbnailMedia.id },
            });

            logger.success('ai', `Linked thumbnail ${thumbnailMedia.id} to video ${videoMedia.id}`);
          }
        }

        logger.success('ai', `UGC media generated for ${platformConfig.platform}: ${ugcMedia.images.length} images, ${ugcMedia.videos.length} videos`);
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

      // Meta Pixel ID → Access Token mapping (each pixel has its own specific token)
      const META_PIXEL_TOKEN_MAPPING: { [pixelId: string]: string } = {
        '1203351311131422': 'EAAJRmTwhsNgBO1OnDiD8eS4vZB2m1JGFUZAi9ErzWUBlV0hPtuoNZCL6TBADDy6jXAbd0lvc0RiZCOxrK991pcuW8b519EnhrpPKt4ZBTLLmUYMkkV4LZCYx1GAkU0uhBbekynZBdrpE30S9Th1x1zwpIUe0OACto0iKDZCFzfd6OBZCZBZBSRcPxZBMGrNZA4BOlqUrUAQZDZD', // L2 - Loans
        '1179895397093948': 'EABZB8DcFpOfsBOynXLGBDvWfGotmCDsrwHy2eaM3h5dbpVkHzg3vUMKmT481gRJlNa7bVRm1yE7ZA3M049Se5wrE0YSvPRDGQeaewl07KIK7uU1yjOolDjoJSZBn2Pno7VMZB2fmPhQH7rux8iITnSVp49Vhf8tYZBWgWqgEFzdWVizYHgBoZChHTi76u68jEVYgZDZD', // A1
        '1435976930918931': 'EABZB8DcFpOfsBO8Vkz5gBxmH9wIkH7CcPxgr9ZAbfF5lhslhfDZBRu7F9L5ZCIWS1H7jlFM3Mef7cRaZBg0IuR2aNo9BOA3HvWECyXHuDV2gEnVRS1aCzQmGV4LFvF6aOyjnyMcJFZBMZAq9iKCj6fmcmdqD25CIkwfvI1Kud269QIxZA0vreVbqUmIUA0XZAxMsmbQZDZD', // B1 - Rsoc Tonic
        '1891445634963589': 'EABZB8DcFpOfsBO6vHZBiXZBgo2LtZCjEpt0qOyQGvxxIN0LgOXp6vxU9VTUQmwkzMnevZAv5LnE2UKFNxhITNZAJb5Crt3tUcNZBREinKrlU4cf29T6hIqxPAZCfKbjbQLRoWO5zkZAZC3Axshd8jstZBnDCwFLjZAd9oWQ9bwCHReODOWltyJVZAudg2PkyDSOS6PXwknwZDZD', // Inforproductos
        '764050146176958': 'EAADuOFCzsHsBPPOGO8j4fzZBKy4BRViYTWiPiCZChKNAQ3sWVhWlTvTp267FXnLEzHgwEEMbWxoUz9fbQKBWaWP2iOSGbM00o3091hARmTf0QTlgPYbpt9a52cqNIxXMEBNx02YL2xzq0sSdepJzPTQ3IQ4a9OU0KEoGZBZAv7ul23HtpwoS5xaWSWCt4kmtGwZDZD', // B3
        '1039541308325786': 'EAAYl7gsCHoQBO1rJjzTkPmehaQaXd4yuSlcFQqo9wicerpGnmxwbGQNfQr0AKdwiBq5suGUxRsPLBAcLEY2NeJ5VQEvZANpLmdx2KWiOrE6ujdJqQGNbspu2O3OtJoruFE44qN77Nu8fR5NWC9maP5OSWbyXJznieeSddXgj6VjLjwmtvML4eBdoKyngjBAZDZD', // Y - Rsoc Tonic
        '878273167774607': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // H - RSOC Tonic
        '2718831948325465': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // Z
        '2180869225678766': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // S
        '847010030396510': 'EAAYl7gsCHoQBOyLePTu9YGoP5oxZCIVW25xphvSsHplE5NGJ5iCen8k2EUdh4W8PQChdH8hrfcEWZCWwrmGtBlblmkIKzbmgvOfIRTJUJtkv41bmjhDxnEKc5sOBCKzPFnzLw2c5AiqFvZAaYuZCQXgoxqWnhJeZBxyIfGATnBaNl31cTnM1RZBQW9iDbzFWjkZCwZDZD', // X - RSOC Tonic
        '860387142264159': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // Q
      };

      // TikTok constants (same for all accounts)
      const TIKTOK_PIXEL_ID = 'CQHUEGBC77U4RGRFJN4G';
      const TIKTOK_ACCESS_TOKEN = '50679817ad0f0f06d1dadd43dbce8f3345b676cd';

      logger.info('tonic', 'Configuring tracking pixels in Tonic...');
      for (const platformConfig of params.platforms) {
        try {
          if (platformConfig.platform === Platform.META) {
            campaignLogger.startStep(campaign.id, 'pixel_meta', 'Configurando pixel de Meta...');
            // Get Meta account to fetch pixel ID and access token
            const metaAccount = await prisma.account.findUnique({
              where: { id: platformConfig.accountId },
            });

            if (!metaAccount) {
              throw new Error(`Meta account ${platformConfig.accountId} not found`);
            }

            // Get pixel ID and access token from DB
            // IMPORTANT: Trim and convert to string to ensure mapping lookup works
            const pixelId = metaAccount.metaPixelId?.toString().trim();
            let accessToken = metaAccount.metaAccessToken;

            if (!pixelId) {
              throw new Error(
                `No pixel ID found for Meta account "${metaAccount.name}". ` +
                `Please configure it in the Account settings.`
              );
            }

            // Debug logging for pixel token mapping
            logger.info('tonic', `🔍 Pixel ID from DB: "${pixelId}" (length: ${pixelId.length})`);
            logger.info('tonic', `🔍 Token mapping keys: ${Object.keys(META_PIXEL_TOKEN_MAPPING).join(', ')}`);
            logger.info('tonic', `🔍 Mapping lookup result: ${META_PIXEL_TOKEN_MAPPING[pixelId] ? 'FOUND' : 'NOT FOUND'}`);

            // FALLBACK: If account doesn't have access token, use global settings
            if (!accessToken) {
              logger.warn('meta', `⚠️  No access token in account "${metaAccount.name}". Trying global settings...`);

              const globalSettings = await prisma.globalSettings.findUnique({
                where: { id: 'global-settings' },
              });

              accessToken = globalSettings?.metaAccessToken ?? null;

              if (!accessToken) {
                // Final fallback to environment variable
                accessToken = process.env.META_ACCESS_TOKEN ?? null;
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

            // Use the pixel-specific token from the mapping, fallback to account token
            const pixelAccessToken = META_PIXEL_TOKEN_MAPPING[pixelId] || accessToken;

            if (META_PIXEL_TOKEN_MAPPING[pixelId]) {
              logger.info('tonic', `✅ Using pixel-specific access token for pixel ${pixelId}`);
            } else {
              logger.warn('tonic', `⚠️  No mapping found for pixel ${pixelId}, using account access token`);
            }

            await tonicService.createPixel(credentials, 'facebook', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              pixel_id: pixelId, // REQUIRED
              access_token: pixelAccessToken, // Use pixel-specific token from mapping
              event_name: 'Purchase',
              revenue_type: 'preestimated_revenue',
            });

            logger.success('tonic', `✅ Facebook pixel ${pixelId} configured for campaign ${tonicCampaignId}`);
            campaignLogger.completeStep(campaign.id, 'pixel_meta', 'Pixel de Meta configurado');

          } else if (platformConfig.platform === Platform.TIKTOK) {
            campaignLogger.startStep(campaign.id, 'pixel_tiktok', 'Configurando pixel de TikTok...');

            // Use the hardcoded TikTok pixel constants for Tonic
            // IMPORTANT: These are DIFFERENT from the TikTok API access token!
            // - TIKTOK_PIXEL_ID: The pixel ID for Tonic tracking
            // - TIKTOK_ACCESS_TOKEN: The specific token for this pixel (NOT the API token)
            const pixelId = TIKTOK_PIXEL_ID;
            const pixelAccessToken = TIKTOK_ACCESS_TOKEN;

            logger.info('tonic', `Configuring TikTok pixel ${pixelId} for campaign ${tonicCampaignId}...`, {
              pixelId,
              accessTokenPreview: pixelAccessToken.substring(0, 10) + '...',
            });

            await tonicService.createPixel(credentials, 'tiktok', {
              campaign_id: parseInt(tonicCampaignId.toString()),
              pixel_id: pixelId,
              access_token: pixelAccessToken,
              revenue_type: 'preestimated_revenue',
            });

            logger.success('tonic', `✅ TikTok pixel ${pixelId} configured for campaign ${tonicCampaignId}`);
            campaignLogger.completeStep(campaign.id, 'pixel_tiktok', 'Pixel de TikTok configurado');
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
              campaignLogger.startStep(campaign.id, 'meta_campaign', 'Creando campaña en Meta...');
              const result = await this.launchToMeta(campaign, platformConfig, aiContentResult, tonicCampaignId?.toString());
              platformResults.push(result);
              if (result.success) {
                campaignLogger.completeStep(campaign.id, 'meta_campaign', 'Campaña creada en Meta');
              } else {
                campaignLogger.failStep(campaign.id, 'meta_campaign', 'Error al crear campaña en Meta', (result as any).error);
              }
            } else if (platformConfig.platform === Platform.TIKTOK) {
              campaignLogger.startStep(campaign.id, 'tiktok_campaign', 'Creando campaña en TikTok...');
              const result = await this.launchToTikTok(
                campaign,
                platformConfig,
                aiContentResult,
                tonicCampaignId?.toString()
              );
              platformResults.push(result);
              if (result.success) {
                campaignLogger.completeStep(campaign.id, 'tiktok_campaign', 'Campaña creada en TikTok');
              } else {
                campaignLogger.failStep(campaign.id, 'tiktok_campaign', 'Error al crear campaña en TikTok', (result as any).error);
              }
            } else if (platformConfig.platform === Platform.TABOOLA) {
              campaignLogger.startStep(campaign.id, 'taboola_campaign', 'Creando campaña en Taboola...');
              const result = await this.launchToTaboola(
                campaign,
                platformConfig,
                aiContentResult,
                tonicCampaignId?.toString()
              );
              platformResults.push(result);
              if (result.success) {
                campaignLogger.completeStep(campaign.id, 'taboola_campaign', 'Campaña creada en Taboola');
              } else {
                campaignLogger.failStep(campaign.id, 'taboola_campaign', 'Error al crear campaña en Taboola', (result as any).error);
              }
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

        // Build errorDetails if there are failures
        const failedPlatforms = platformResults.filter(r => !r.success);
        const errorDetailsData = !allSuccessful && failedPlatforms.length > 0 ? {
          step: 'platform-launch',
          message: failedPlatforms.map(p => `${p.platform}: ${'error' in p ? p.error : 'Unknown error'}`).join('; '),
          timestamp: new Date().toISOString(),
          platform: failedPlatforms.map(p => p.platform).join(', '),
          technicalDetails: JSON.stringify(failedPlatforms, null, 2),
        } : undefined;

        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: allSuccessful ? CampaignStatus.ACTIVE : CampaignStatus.FAILED,
            launchedAt: new Date(),
            ...(errorDetailsData && { errorDetails: errorDetailsData }),
          },
        });

        logger.success('system', `Campaign launch complete! Status: ${allSuccessful ? 'ACTIVE' : 'FAILED'}`, {
          campaignId: campaign.id,
          platforms: platformResults.map(p => ({ platform: p.platform, success: p.success })),
        });

        // Notificar al panel de logs el resultado final
        if (allSuccessful) {
          campaignLogger.complete(campaign.id, '¡Campaña lanzada exitosamente!');
        } else {
          campaignLogger.completeWithError(campaign.id, 'La campaña se completó con errores en algunas plataformas');
        }

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

      // Notificar al panel de logs del error
      if (campaign?.id) {
        campaignLogger.failStep(campaign.id, 'error', 'Error en el lanzamiento de la campaña', error.message);
        campaignLogger.completeWithError(campaign.id, 'El lanzamiento falló');

        // Guardar detalles del error en la BD
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.FAILED,
            errorDetails: {
              step: 'launch',
              message: error.message,
              timestamp: new Date().toISOString(),
              technicalDetails: error.stack || error.message,
            },
          },
        });
      }

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
    // Meta: {{ad.id}} (Ad ID)
    // TikTok: __CID__ (Campaign ID)
    const adIdMacro = platform === 'META' ? '{{ad.id}}' : '__CID__';
    url.searchParams.set('ad_id', adIdMacro);

    // 5. TikTok-specific: ttclid (Click ID for conversion tracking)
    if (platform === 'TIKTOK') {
      url.searchParams.set('ttclid', '__CLICKID__');
    }

    // 6. dpco (Always 1)
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

      accessToken = globalSettings?.metaAccessToken ?? null;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = process.env.META_ACCESS_TOKEN ?? null;
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
    const hasMultipleVideos = useVideo && videos.length > 1;
    const adFormat = useVideo ? 'VIDEO' : 'IMAGE';

    // Check if manual ad copy was provided for Meta
    const hasManualAdCopy = platformConfig.manualAdCopy &&
      (platformConfig.manualAdCopy.adTitle ||
       platformConfig.manualAdCopy.description ||
       platformConfig.manualAdCopy.primaryText);

    let adCopy: { headline: string; primaryText: string; description: string; callToAction: string };

    if (hasManualAdCopy) {
      // Use manual values - empty fields stay empty (as per user requirement)
      logger.info('meta', 'Using MANUAL ad copy values (empty fields will remain empty)');
      adCopy = {
        headline: platformConfig.manualAdCopy.adTitle || '',
        primaryText: platformConfig.manualAdCopy.primaryText || '',
        description: platformConfig.manualAdCopy.description || '',
        callToAction: 'LEARN_MORE',
      };
      logger.info('meta', 'Manual ad copy:', {
        headline: adCopy.headline || '(empty)',
        primaryText: adCopy.primaryText || '(empty)',
        description: adCopy.description || '(empty)',
      });
    } else {
      // Generate ad copy with AI (all fields empty = use AI)
      logger.info('meta', 'Generating ad copy with AI (no manual values provided)');
      adCopy = await aiService.generateAdCopy({
        offerName: campaign.offer.name,
        copyMaster: aiContent.copyMaster,
        platform: 'META',
        adFormat: adFormat,
        country: campaign.country,
        language: campaign.language,
      });
    }

    // Determine budget strategy: CBO (Campaign Budget Optimization) vs ABO (Ad Set Budget Optimization)
    const isCBO = campaign.campaignType === 'CBO';
    const budgetInCents = parseInt(platformConfig.budget) * 100; // Convert to cents (Meta requirement)

    logger.info('meta', `Using ${isCBO ? 'CBO (Campaign Budget Optimization)' : 'ABO (Ad Set Budget Optimization)'}`, {
      campaignType: campaign.campaignType,
      budget: platformConfig.budget,
      budgetInCents,
    });

    // Determine if we have restricted Special Ad Categories (CREDIT/FINANCIAL_PRODUCTS_SERVICES, HOUSING, EMPLOYMENT)
    // These categories require specific objectives and country parameter
    const restrictedCategories = ['CREDIT', 'HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];
    const hasRestrictedCategory = platformConfig.specialAdCategories?.some(
      (cat: string) => restrictedCategories.includes(cat)
    );

    // ALWAYS use OUTCOME_SALES (Ventas) - this is the correct objective for conversion campaigns
    // Note: Even with Special Ad Categories, we use OUTCOME_SALES for purchase tracking
    const campaignObjective = 'OUTCOME_SALES';

    logger.info('meta', `Campaign objective: ${campaignObjective} (always OUTCOME_SALES)`, {
      hasRestrictedCategory,
      country: campaign.country,
      specialAdCategories: platformConfig.specialAdCategories,
    });

    // Create Campaign (according to Meta Ads API)
    // Transform special ad categories to Meta's current API values
    // Note: Meta renamed 'CREDIT' to 'FINANCIAL_PRODUCTS_SERVICES' in 2025
    const transformSpecialAdCategory = (cat: string): string => {
      if (cat === 'CREDIT') return 'FINANCIAL_PRODUCTS_SERVICES';
      return cat;
    };

    // Transform and pass special_ad_categories if user selected them
    const effectiveSpecialAdCategories = platformConfig.specialAdCategories && platformConfig.specialAdCategories.length > 0
      ? platformConfig.specialAdCategories.map(transformSpecialAdCategory)
      : ['NONE'];

    logger.info('meta', 'Special Ad Categories transformation:', {
      original: platformConfig.specialAdCategories,
      transformed: effectiveSpecialAdCategories,
    });

    const metaCampaign = await metaService.createCampaign({
      name: fullCampaignName,
      objective: campaignObjective,
      status: 'ACTIVE', // Campaign active, only ads are paused
      special_ad_categories: effectiveSpecialAdCategories,
      // Required when special_ad_categories is not NONE - pass all target countries (WORLDWIDE = 87)
      special_ad_category_country: hasRestrictedCategory ? resolveCountryCodes(campaign.country) : undefined,
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

    // Process Age - ALWAYS use widest range (18-65) for maximum reach
    // Per user request: Do NOT use AI-suggested age ranges
    const ageMin = 18;
    const ageMax = 65;

    // Process Language (Locales)
    // Map common language codes to Meta Locale IDs
    // 6 = Spanish (All), 1001 = English (US), etc.
    // See: https://developers.facebook.com/docs/marketing-api/audiences/reference/targeting-search/
    logger.info('meta', `=== LANGUAGE DEBUG ===`);
    logger.info('meta', `campaign.language raw value: "${campaign.language}"`);
    logger.info('meta', `campaign.language type: ${typeof campaign.language}`);

    // Meta Locale IDs for targeting (verified via Ads Manager):
    // 6 = English (UK), 23 = Spanish, 24 = English (US)
    // IMPORTANTE: Usar UN SOLO ID por idioma para evitar mezclar idiomas
    const localeMap: Record<string, number[]> = {
      // Español - SOLO ID 23
      'es': [23],
      'español': [23],
      'spanish': [23],
      // Inglés (EE.UU.) - ID 24
      'en': [24],
      'english': [24],
      'inglés': [24],
      // Portugués (17 = Portugal, 18 = Brazil)
      'pt': [17, 18],
      'portuguese': [17, 18],
      'portugués': [17, 18],
      // Francés
      'fr': [9],
      'french': [9],
      'francés': [9],
      // Alemán
      'de': [7],
      'german': [7],
      'alemán': [7],
      // Italiano
      'it': [10],
      'italian': [10],
      'italiano': [10],
    };

    // Normalize language input (lowercase, trim)
    // If language is empty/null, don't default to 'en' - use undefined to skip locale targeting
    const normalizedLang = campaign.language ? campaign.language.toLowerCase().trim() : '';
    const targetLocales = normalizedLang ? (localeMap[normalizedLang] || undefined) : undefined;

    logger.info('meta', `Normalized language: "${normalizedLang}"`);
    logger.info('meta', `Locale lookup result: ${JSON.stringify(targetLocales)}`);

    if (!targetLocales) {
      logger.warn('meta', `No locale mapping found for language "${campaign.language}" (normalized: "${normalizedLang}"). Targeting all languages.`);
    } else {
      logger.info('meta', `✅ Targeting locales: ${JSON.stringify(targetLocales)} for language "${campaign.language}"`);
    }
    logger.info('meta', `=== END LANGUAGE DEBUG ===`);

    // Resolve country codes - WORLDWIDE expands to all 87 allowed countries
    const targetCountries = resolveCountryCodes(campaign.country);
    logger.info('meta', `Targeting ${targetCountries.length} country(ies): ${isWorldwide(campaign.country) ? 'WORLDWIDE' : campaign.country}`, {
      isWorldwide: isWorldwide(campaign.country),
      countryCount: targetCountries.length,
    });

    // Build targeting object - only include locales if we have a valid value
    const targetingSpec: any = {
      geo_locations: {
        countries: targetCountries, // Use resolved country codes (WORLDWIDE = 87 countries)
      },
      age_min: ageMin,
      age_max: ageMax,
      publisher_platforms: ['facebook', 'instagram', 'messenger'], // Explicitly set platforms
    };

    // NOTE: Interests and behaviors are NOT added to targeting per user request
    // This ensures the widest possible audience reach
    // targetInterests and targetBehaviors are available but intentionally not used

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

    // Conversion event type - ALWAYS use PURCHASE since we always use OUTCOME_SALES
    const conversionEventType = 'PURCHASE';

    // Helper function to create an ad set (used for both CBO single ad set and ABO multiple ad sets)
    const createMetaAdSet = async (adSetNameSuffix: string = 'AdSet', adSetBudget?: number) => {
      return await metaService.createAdSet({
        campaign_id: metaCampaign.id,
        name: `${fullCampaignName} - ${adSetNameSuffix}`,
        optimization_goal: 'OFFSITE_CONVERSIONS', // Correct goal for Website Leads (Pixel)
        billing_event: 'IMPRESSIONS', // Standard for lead gen

        // ABO Logic: Set budget and bid strategy at Ad Set level if NOT CBO
        daily_budget: !isCBO ? (adSetBudget || budgetInCents) : undefined,
        bid_strategy: !isCBO ? 'LOWEST_COST_WITHOUT_CAP' : undefined,

        start_time: new Date(platformConfig.startDateTime || platformConfig.startDate).toISOString(),
        targeting: targetingSpec,
        status: 'ACTIVE', // Ad Set active, only ads are paused
        promoted_object: {
          pixel_id: pixelId,
          custom_event_type: conversionEventType,
        },
      }, adAccountId, accessToken);
    };

    // For CBO: Create a single Ad Set upfront (all ads go in this ad set)
    // For ABO: Ad sets are created in the loop below (one per media)
    let adSet: any = null;
    // ABO counter for sequential naming (ABO1, ABO2, ABO3, etc.)
    let aboCounter = 0;
    if (isCBO) {
      adSet = await createMetaAdSet('AdSet');
      logger.success('meta', `CBO: Single ad set created with ID: ${adSet.id}`);
    } else {
      logger.info('meta', `ABO: Ad sets will be created per media item with sequential numbering`);
    }
    let imageHash: string | undefined;
    let videoId: string | undefined;
    // Array to store uploaded image hashes for carousel/multiple ads
    const uploadedImageHashes: Array<{ mediaId: string; imageHash: string; url: string }> = [];

    // Validation: Video ads require at least one image for thumbnail
    if (useVideo && images.length === 0) {
      throw new Error(
        'Meta requires a thumbnail image for video ads. Please upload at least one image along with your video.'
      );
    }

    if (useVideo && !hasMultipleVideos) {
      // UPLOAD SINGLE VIDEO (for single video ads only)
      // Multiple videos are handled separately in the ABO multiple videos section
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

      // UPLOAD THUMBNAIL
      // Check if video has a linked thumbnail, otherwise use first image
      let thumbnailImage: any;
      if (video.thumbnailMediaId) {
        // Use the linked thumbnail
        thumbnailImage = await prisma.media.findUnique({
          where: { id: video.thumbnailMediaId },
        });
        logger.info('meta', `Using linked thumbnail for video: ${thumbnailImage?.fileName}`);
      }

      // Fallback to first image if no linked thumbnail
      if (!thumbnailImage) {
        thumbnailImage = images[0];
        logger.info('meta', `Using first image as thumbnail: ${thumbnailImage?.fileName}`);
      }

      if (!thumbnailImage) {
        throw new Error('No thumbnail available for video. Please upload an image as thumbnail.');
      }

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

    } else if (!hasMultipleVideos) {
      // UPLOAD ALL IMAGES (for CBO Carousel or ABO Multiple Ads)
      // Skip this when we have multiple videos (they're handled in the video ads section)
      const axios = require('axios');

      logger.info('meta', `Uploading ${images.length} images to Meta...`);

      for (const image of images) {
        logger.info('meta', `Uploading image: ${image.fileName}`);
        logger.info('meta', `📥 Downloading image from URL: ${image.url}`);

        let imageBuffer: Buffer;
        try {
          const response = await axios.get(image.url, { responseType: 'arraybuffer' });
          imageBuffer = Buffer.from(response.data);
          logger.info('meta', `✅ Image downloaded successfully: ${imageBuffer.length} bytes`);
        } catch (downloadError: any) {
          logger.error('meta', `❌ Failed to download image from GCS`, {
            url: image.url,
            fileName: image.fileName,
            status: downloadError.response?.status,
            statusText: downloadError.response?.statusText,
            errorMessage: downloadError.message,
            responseData: downloadError.response?.data ?
              (typeof downloadError.response.data === 'string'
                ? downloadError.response.data.substring(0, 500)
                : JSON.stringify(downloadError.response.data).substring(0, 500))
              : 'No response data',
          });
          throw new Error(`Failed to download image ${image.fileName} from storage: ${downloadError.response?.status || downloadError.message}`);
        }

        const hash = await metaService.uploadImage(imageBuffer, image.fileName, adAccountId, accessToken);

        await prisma.media.update({
          where: { id: image.id },
          data: {
            usedInMeta: true,
            metaHash: hash,
          },
        });

        uploadedImageHashes.push({ mediaId: image.id, imageHash: hash, url: image.url });
        logger.success('meta', `Image uploaded: ${image.fileName}`, { imageHash: hash });
      }

      // Set the first image hash for backwards compatibility
      imageHash = uploadedImageHashes[0]?.imageHash;

      logger.success('meta', `All ${uploadedImageHashes.length} images uploaded successfully`);
    }

    // Create Ad Creative (according to Meta Ads API)
    // Use the Page ID selected by user in wizard, or fall back to account default
    const effectivePageId = platformConfig.metaPageId || metaAccount.metaPageId;
    if (!effectivePageId) {
      throw new Error(`Meta Page ID not found. Please select a Fan Page in the wizard or configure it in Account settings.`);
    }
    logger.info('meta', `Using Fan Page ID: ${effectivePageId} (user-selected: ${!!platformConfig.metaPageId})`);

    // Get Instagram actor ID
    // Priority: 1) User-selected Instagram account, 2) Page-backed Instagram (fallback)
    let instagramActorId: string | null = null;

    if (platformConfig.instagramAccountId) {
      // User explicitly selected an Instagram account in the wizard
      instagramActorId = platformConfig.instagramAccountId;
      logger.info('meta', `✅ Using user-selected Instagram account ID: ${instagramActorId}`);
    } else {
      // Fallback: Get page-backed Instagram for "Use Facebook Page as Instagram" option
      // NOTE: Page-backed Instagram accounts are special - they represent "Use Facebook Page as Instagram"
      // and always work if you have access to the Fan Page. They do NOT need verification against
      // /instagram_accounts because they are not real Instagram accounts.
      try {
        instagramActorId = await metaService.getPageBackedInstagramAccount(
          effectivePageId,
          accessToken
        );
        if (instagramActorId) {
          logger.info('meta', `✅ Got page-backed Instagram actor ID: ${instagramActorId} for page ${effectivePageId}`);
          logger.info('meta', `ℹ️ This represents "Use Facebook Page as Instagram" option`);
        } else {
          logger.warn('meta', `⚠️ No page-backed Instagram account found for page ${effectivePageId}. Instagram identity will be empty.`);
        }
      } catch (error: any) {
        logger.warn('meta', `Failed to get Instagram actor ID for page ${effectivePageId}: ${error.message}. Continuing without it.`);
      }
    }

    // FORMAT TONIC LINK
    // Use campaign.copyMaster (user-entered) instead of aiContent.copyMaster (AI-processed)
    const finalLink = this.formatTonicLink(
      campaign.tonicTrackingLink || 'https://example.com',
      'META',
      campaign.copyMaster
    );

    logger.info('meta', `Using formatted Tonic link: ${finalLink} `);

    // Determine ad creation strategy:
    // - CBO with multiple images: Create MULTIPLE individual ads in the SAME ad set (NOT carousel)
    // - ABO with multiple images: Create MULTIPLE ad sets, each with ONE ad
    // Note: hasMultipleVideos is defined earlier (near useVideo) for use in upload logic
    const hasMultipleImages = !useVideo && images.length > 1;
    // CBO now creates multiple individual ads, not carousel
    const useCBOMultipleAds = isCBO && hasMultipleImages;
    const useABOMultipleAds = !isCBO && (hasMultipleImages || hasMultipleVideos);

    logger.info('meta', `Ad creation strategy:`, {
      useVideo,
      hasMultipleImages,
      hasMultipleVideos,
      imageCount: images.length,
      videoCount: videos.length,
      isCBO,
      useCBOMultipleAds,
      useABOMultipleAds,
    });

    let creative: any;
    let ad: any;
    const createdAds: Array<{ adId: string; creativeId: string; adSetId?: string }> = [];

    if (useVideo && !hasMultipleVideos) {
      // VIDEO AD - Single video with thumbnail
      // ABO: Need to create an ad set (for CBO it was created at the start)
      if (!isCBO && !adSet) {
        aboCounter++;
        adSet = await createMetaAdSet(`ABO${aboCounter}`);
        logger.success('meta', `ABO: Created ad set ABO${aboCounter} for video: ${adSet.id}`);
      }

      creative = await metaService.createAdCreative({
        name: `${campaign.name} - Video Creative`,
        object_story_spec: {
          page_id: effectivePageId,
          ...(instagramActorId && { instagram_user_id: instagramActorId }),
          video_data: {
            video_id: videoId!,
            image_hash: imageHash!,
            title: adCopy.headline,
            message: adCopy.primaryText,
            call_to_action: {
              type: 'LEARN_MORE',
              value: { link: finalLink },
            },
          },
        },
      }, adAccountId, accessToken);

      logger.success('meta', `Video creative created with ID: ${creative.id}`);

      ad = await metaService.createAd({
        name: getTomorrowDate(),
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      }, adAccountId, accessToken);

      createdAds.push({ adId: ad.id, creativeId: creative.id });
      logger.success('meta', `Video ad created with ID: ${ad.id}`);

    } else if (useCBOMultipleAds) {
      // CBO MULTIPLE INDIVIDUAL ADS - Each image gets its own ad in the SAME ad set
      // This is the correct CBO behavior: multiple ads compete in a single ad set
      logger.info('meta', `Creating ${uploadedImageHashes.length} Individual Ads in single Ad Set (CBO mode)`);

      for (let idx = 0; idx < uploadedImageHashes.length; idx++) {
        const imgData = uploadedImageHashes[idx];

        logger.info('meta', `Creating ad ${idx + 1}/${uploadedImageHashes.length} for image...`);

        // Create individual creative for this image
        const individualCreative = await metaService.createAdCreative({
          name: `${campaign.name} - Image ${idx + 1} Creative`,
          object_story_spec: {
            page_id: effectivePageId,
            ...(instagramActorId && { instagram_user_id: instagramActorId }),
            link_data: {
              link: finalLink,
              message: adCopy.primaryText,
              name: adCopy.headline,
              description: adCopy.description,
              image_hash: imgData.imageHash,
              call_to_action: {
                type: 'LEARN_MORE',
                value: { link: finalLink },
              },
            },
          },
        }, adAccountId, accessToken);

        logger.success('meta', `Creative ${idx + 1} created with ID: ${individualCreative.id}`);

        // Create ad in the SAME ad set (CBO - all ads in one ad set)
        const individualAd = await metaService.createAd({
          name: `${getTomorrowDate()} - Ad ${idx + 1}`,
          adset_id: adSet.id,
          creative: { creative_id: individualCreative.id },
          status: 'PAUSED',
        }, adAccountId, accessToken);

        createdAds.push({ adId: individualAd.id, creativeId: individualCreative.id });
        logger.success('meta', `Ad ${idx + 1}/${uploadedImageHashes.length} created with ID: ${individualAd.id}`);
      }

      // Set creative and ad to the last one for backwards compatibility
      creative = { id: createdAds[createdAds.length - 1]?.creativeId };
      ad = { id: createdAds[createdAds.length - 1]?.adId };

      logger.success('meta', `CBO: All ${createdAds.length} individual ads created in ad set ${adSet.id}`);

    } else if (hasMultipleVideos) {
      // MULTIPLE VIDEO ADS - Handle differently for CBO vs ABO
      // CBO: One ad set with multiple video ads
      // ABO: Group videos into ad sets based on adsPerAdSet configuration

      const axios = require('axios');
      const adsPerAdSet = platformConfig.adsPerAdSet || 1;

      if (isCBO) {
        logger.info('meta', `Creating ${videos.length} Video Ads in single Ad Set (CBO mode)`);

        // CBO: All videos go into the single ad set created at the start
        for (let idx = 0; idx < videos.length; idx++) {
          const video = videos[idx];

          // Upload video
          logger.info('meta', `Uploading video ${idx + 1}/${videos.length}: ${video.fileName}`);
          const videoResponse = await axios.get(video.url, { responseType: 'arraybuffer' });
          const videoBuffer = Buffer.from(videoResponse.data);
          const uploadedVideoId = await metaService.uploadVideo(videoBuffer, video.fileName, adAccountId, accessToken);

          await prisma.media.update({
            where: { id: video.id },
            data: { usedInMeta: true },
          });

          // Get linked thumbnail or fallback to image at same index
          let thumbnailImage: any;
          if (video.thumbnailMediaId) {
            thumbnailImage = await prisma.media.findUnique({
              where: { id: video.thumbnailMediaId },
            });
            logger.info('meta', `Using linked thumbnail for video ${idx + 1}: ${thumbnailImage?.fileName}`);
          }
          if (!thumbnailImage && images.length > 0) {
            thumbnailImage = images[idx] || images[0];
            logger.info('meta', `Using fallback thumbnail for video ${idx + 1}: ${thumbnailImage?.fileName}`);
          }

          if (!thumbnailImage) {
            throw new Error(`No thumbnail available for video ${video.fileName}. Please upload a thumbnail image.`);
          }

          // Upload thumbnail
          const thumbResponse = await axios.get(thumbnailImage.url, { responseType: 'arraybuffer' });
          const thumbBuffer = Buffer.from(thumbResponse.data);
          const thumbHash = await metaService.uploadImage(thumbBuffer, thumbnailImage.fileName, adAccountId, accessToken);

          await prisma.media.update({
            where: { id: thumbnailImage.id },
            data: { usedInMeta: true, metaHash: thumbHash },
          });

          // Create video creative
          const videoCreative = await metaService.createAdCreative({
            name: `${campaign.name} - Video Creative ${idx + 1}`,
            object_story_spec: {
              page_id: effectivePageId,
              ...(instagramActorId && { instagram_user_id: instagramActorId }),
              video_data: {
                video_id: uploadedVideoId,
                image_hash: thumbHash,
                title: adCopy.headline,
                message: adCopy.primaryText,
                call_to_action: {
                  type: 'LEARN_MORE',
                  value: { link: finalLink },
                },
              },
            },
          }, adAccountId, accessToken);

          // Create ad in the single CBO ad set
          const videoAd = await metaService.createAd({
            name: `${getTomorrowDate()}_${idx + 1}`,
            adset_id: adSet.id,
            creative: { creative_id: videoCreative.id },
            status: 'PAUSED',
          }, adAccountId, accessToken);

          createdAds.push({ adId: videoAd.id, creativeId: videoCreative.id, adSetId: adSet.id });
          logger.success('meta', `Video Ad ${idx + 1}/${videos.length} created in CBO ad set`, {
            adSetId: adSet.id,
            adId: videoAd.id,
            videoId: uploadedVideoId,
            thumbnailHash: thumbHash,
          });
        }
      } else {
        // ABO: Group videos into ad sets based on adsPerAdSet configuration
        const totalVideos = videos.length;
        const totalAdSets = Math.ceil(totalVideos / adsPerAdSet);

        logger.info('meta', `Creating ${totalAdSets} Video Ad Sets with up to ${adsPerAdSet} ads each (ABO mode)`, {
          totalVideos,
          adsPerAdSet,
          totalAdSets,
        });

        // Group videos into chunks based on adsPerAdSet
        const videoChunks: typeof videos[] = [];
        for (let i = 0; i < totalVideos; i += adsPerAdSet) {
          videoChunks.push(videos.slice(i, i + adsPerAdSet));
        }

        for (let chunkIdx = 0; chunkIdx < videoChunks.length; chunkIdx++) {
          const chunk = videoChunks[chunkIdx];

          // ABO: Create an ad set for this group of videos
          aboCounter++;
          const videoAdSet = await createMetaAdSet(`ABO${aboCounter}`);
          logger.success('meta', `ABO: Created ad set ABO${aboCounter} with ${chunk.length} video ad(s): ${videoAdSet.id}`);

          // Create ads for each video in this chunk within the SAME ad set
          for (let vidIdx = 0; vidIdx < chunk.length; vidIdx++) {
            const video = chunk[vidIdx];
            const globalVidIdx = chunkIdx * adsPerAdSet + vidIdx;

            // Upload video
            logger.info('meta', `Uploading video ${globalVidIdx + 1}/${totalVideos}: ${video.fileName}`);
            const videoResponse = await axios.get(video.url, { responseType: 'arraybuffer' });
            const videoBuffer = Buffer.from(videoResponse.data);
            const uploadedVideoId = await metaService.uploadVideo(videoBuffer, video.fileName, adAccountId, accessToken);

            await prisma.media.update({
              where: { id: video.id },
              data: { usedInMeta: true },
            });

            // Get linked thumbnail or fallback to image at same index
            let thumbnailImage: any;
            if (video.thumbnailMediaId) {
              thumbnailImage = await prisma.media.findUnique({
                where: { id: video.thumbnailMediaId },
              });
              logger.info('meta', `Using linked thumbnail for video ${globalVidIdx + 1}: ${thumbnailImage?.fileName}`);
            }
            if (!thumbnailImage && images.length > 0) {
              thumbnailImage = images[globalVidIdx] || images[0];
              logger.info('meta', `Using fallback thumbnail for video ${globalVidIdx + 1}: ${thumbnailImage?.fileName}`);
            }

            if (!thumbnailImage) {
              throw new Error(`No thumbnail available for video ${video.fileName}. Please upload a thumbnail image.`);
            }

            // Upload thumbnail
            const thumbResponse = await axios.get(thumbnailImage.url, { responseType: 'arraybuffer' });
            const thumbBuffer = Buffer.from(thumbResponse.data);
            const thumbHash = await metaService.uploadImage(thumbBuffer, thumbnailImage.fileName, adAccountId, accessToken);

            await prisma.media.update({
              where: { id: thumbnailImage.id },
              data: { usedInMeta: true, metaHash: thumbHash },
            });

            // Create video creative
            const videoCreative = await metaService.createAdCreative({
              name: `${campaign.name} - Video Creative ${globalVidIdx + 1}`,
              object_story_spec: {
                page_id: effectivePageId,
                ...(instagramActorId && { instagram_user_id: instagramActorId }),
                video_data: {
                  video_id: uploadedVideoId,
                  image_hash: thumbHash,
                  title: adCopy.headline,
                  message: adCopy.primaryText,
                  call_to_action: {
                    type: 'LEARN_MORE',
                    value: { link: finalLink },
                  },
                },
              },
            }, adAccountId, accessToken);

            // Create ad in THIS ad set (shared with other videos in the same chunk)
            const videoAd = await metaService.createAd({
              name: `${getTomorrowDate()}_${globalVidIdx + 1}`,
              adset_id: videoAdSet.id,
              creative: { creative_id: videoCreative.id },
              status: 'PAUSED',
            }, adAccountId, accessToken);

            createdAds.push({ adId: videoAd.id, creativeId: videoCreative.id, adSetId: videoAdSet.id });
            logger.success('meta', `Video Ad ${globalVidIdx + 1}/${totalVideos} created in ad set ABO${aboCounter}`, {
              adSetId: videoAdSet.id,
              adId: videoAd.id,
              videoId: uploadedVideoId,
              thumbnailHash: thumbHash,
              adsInThisAdSet: vidIdx + 1,
            });
          }

          // Keep track of the last ad set for backwards compatibility
          adSet = videoAdSet;
        }
      }

      // Use the last created ad/creative for return value
      creative = { id: createdAds[createdAds.length - 1].creativeId };
      ad = { id: createdAds[createdAds.length - 1].adId };

      logger.success('meta', `All ${createdAds.length} video ads created successfully (${isCBO ? 'CBO' : `ABO with ${adsPerAdSet} ads per adset`} mode)`);

    } else if (useABOMultipleAds) {
      // ABO MULTIPLE IMAGE ADS - Group ads into ad sets based on adsPerAdSet configuration
      // adsPerAdSet determines how many ads go into each ad set
      const adsPerAdSet = platformConfig.adsPerAdSet || 1;
      const totalImages = uploadedImageHashes.length;
      const totalAdSets = Math.ceil(totalImages / adsPerAdSet);

      logger.info('meta', `Creating ${totalAdSets} Ad Sets with up to ${adsPerAdSet} ads each (ABO mode)`, {
        totalImages,
        adsPerAdSet,
        totalAdSets,
      });

      // Group images into chunks based on adsPerAdSet
      const imageChunks: typeof uploadedImageHashes[] = [];
      for (let i = 0; i < totalImages; i += adsPerAdSet) {
        imageChunks.push(uploadedImageHashes.slice(i, i + adsPerAdSet));
      }

      for (let chunkIdx = 0; chunkIdx < imageChunks.length; chunkIdx++) {
        const chunk = imageChunks[chunkIdx];

        // ABO: Create an ad set for this group of images
        aboCounter++;
        const imageAdSet = await createMetaAdSet(`ABO${aboCounter}`);
        logger.success('meta', `ABO: Created ad set ABO${aboCounter} with ${chunk.length} ad(s): ${imageAdSet.id}`);

        // Create ads for each image in this chunk within the SAME ad set
        for (let imgIdx = 0; imgIdx < chunk.length; imgIdx++) {
          const imgData = chunk[imgIdx];
          const globalImgIdx = chunkIdx * adsPerAdSet + imgIdx;

          const imgCreative = await metaService.createAdCreative({
            name: `${campaign.name} - Creative ${globalImgIdx + 1}`,
            object_story_spec: {
              page_id: effectivePageId,
              ...(instagramActorId && { instagram_user_id: instagramActorId }),
              link_data: {
                link: finalLink,
                message: adCopy.primaryText,
                name: adCopy.headline,
                description: adCopy.description,
                image_hash: imgData.imageHash,
                call_to_action: {
                  type: 'LEARN_MORE',
                  value: { link: finalLink },
                },
              },
            },
          }, adAccountId, accessToken);

          // Create ad in THIS ad set (shared with other ads in the same chunk)
          const imgAd = await metaService.createAd({
            name: `${getTomorrowDate()}_${globalImgIdx + 1}`,
            adset_id: imageAdSet.id, // All ads in chunk share the same ad set
            creative: { creative_id: imgCreative.id },
            status: 'PAUSED',
          }, adAccountId, accessToken);

          createdAds.push({ adId: imgAd.id, creativeId: imgCreative.id, adSetId: imageAdSet.id });
          logger.success('meta', `Image Ad ${globalImgIdx + 1}/${totalImages} created in ad set ABO${aboCounter}`, {
            adSetId: imageAdSet.id,
            adId: imgAd.id,
            creativeId: imgCreative.id,
            adsInThisAdSet: imgIdx + 1,
          });
        }

        // Keep track of the last ad set for backwards compatibility
        adSet = imageAdSet;
      }

      // Use the last created ad/creative for return value
      creative = { id: createdAds[createdAds.length - 1].creativeId };
      ad = { id: createdAds[createdAds.length - 1].adId };

      logger.success('meta', `All ${createdAds.length} image ads created in ${totalAdSets} ad sets (ABO mode, ${adsPerAdSet} ads per adset)`);

    } else {
      // SINGLE IMAGE AD - Standard single image ad
      // ABO: Need to create an ad set (for CBO it was created at the start)
      if (!isCBO && !adSet) {
        aboCounter++;
        adSet = await createMetaAdSet(`ABO${aboCounter}`);
        logger.success('meta', `ABO: Created ad set ABO${aboCounter} for image: ${adSet.id}`);
      }

      creative = await metaService.createAdCreative({
        name: `${campaign.name} - Creative`,
        object_story_spec: {
          page_id: effectivePageId,
          ...(instagramActorId && { instagram_user_id: instagramActorId }),
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
        },
      }, adAccountId, accessToken);

      logger.success('meta', `Single image creative created with ID: ${creative.id}`);

      ad = await metaService.createAd({
        name: getTomorrowDate(),
        adset_id: adSet.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      }, adAccountId, accessToken);

      createdAds.push({ adId: ad.id, creativeId: creative.id });
      logger.success('meta', `Single image ad created with ID: ${ad.id}`);
    }

    // Update campaign-platform status
    await prisma.campaignPlatform.updateMany({
      where: {
        campaignId: campaign.id,
        platform: Platform.META,
      },
      data: {
        metaCampaignId: metaCampaign.id,
        metaAdSetId: adSet.id,
        metaAdId: ad.id, // Store the last/main ad ID
        status: CampaignStatus.ACTIVE,
      },
    });

    logger.success('meta', `Meta campaign launched successfully`, {
      campaignId: metaCampaign.id,
      adSetId: adSet.id,
      adId: ad.id,
      adFormat: useVideo ? 'VIDEO' : (useCBOMultipleAds ? 'CBO_MULTIPLE_ADS' : (useABOMultipleAds ? 'ABO_MULTIPLE_ADS' : 'SINGLE_IMAGE')),
      totalAds: createdAds.length,
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

    // IMPORTANTE: TikTok PLACEMENT_TIKTOK (in-feed) SOLO soporta VIDEO, NO imágenes estáticas
    // Validar que tengamos al menos un video
    if (videos.length === 0) {
      throw new Error(
        'TikTok requires VIDEO for in-feed ads (PLACEMENT_TIKTOK does not support static images). ' +
        'Please upload a video file (.mp4, .mov, etc.) to launch this campaign on TikTok.'
      );
    }

    logger.info('tiktok', `Found ${videos.length} video(s) for TikTok campaign`, {
      videos: videos.map(v => v.fileName),
    });

    const adFormat = 'VIDEO'; // TikTok PLACEMENT_TIKTOK siempre requiere VIDEO

    // Generate ad copy specific to TikTok
    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
      adFormat: adFormat,
      country: campaign.country,
      language: campaign.language,
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

      accessToken = globalSettings?.tiktokAccessToken ?? null;

      if (!accessToken) {
        // Final fallback to environment variable
        accessToken = process.env.TIKTOK_ACCESS_TOKEN ?? null;
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

    // Create Campaign (according to TikTok Ads API)
    // Obtener pixelId: primero de platformConfig, luego de la cuenta de TikTok
    const pixelId = platformConfig.pixelId || tiktokAccount.tiktokPixelId;

    // VALIDACIÓN: Para conversiones de ventas, el Pixel es OBLIGATORIO
    if (!pixelId) {
      throw new Error(
        'TikTok Pixel ID is required for conversion campaigns (Sales). ' +
        'Please configure a Pixel in the account settings or platform configuration.'
      );
    }
    logger.info('tiktok', `Using TikTok Pixel ID: ${pixelId}`);

    // WEB_CONVERSIONS objective for Sales/Purchase optimization
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
      objective_type: 'WEB_CONVERSIONS', // Para conversiones de ventas (Sales)
      budget_mode: 'BUDGET_MODE_DAY',
      budget: budgetInDollars, // TikTok API expects budget in DOLLARS (not cents!)
      operation_status: 'ENABLE', // Campaign active, only ads are paused
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
    // TikTok Age Groups: AGE_13_17, AGE_18_24, AGE_25_34, AGE_35_44, AGE_45_54, AGE_55_100
    // NOTE: AGE_55_100 covers all users 55 and older (there is no AGE_55_64 or AGE_65_PLUS)
    // Per user request: ALWAYS use ALL age groups EXCEPT AGE_13_17 for widest reach
    const tiktokAgeGroups: string[] = [
      'AGE_18_24',
      'AGE_25_34',
      'AGE_35_44',
      'AGE_45_54',
      'AGE_55_100'
    ];
    // NOTE: AI-suggested age groups are intentionally NOT used

    // Note: Interest mapping for TikTok requires Category IDs which are complex to map without fuzzy search.
    // We are skipping interest mapping for now and relying on broad targeting + pixel optimization.

    // Get Location IDs for TikTok - handle WORLDWIDE by resolving all 87 country codes
    let locationIds: string[];
    try {
      const targetCountriesTiktok = resolveCountryCodes(campaign.country);
      if (isWorldwide(campaign.country)) {
        logger.info('tiktok', `WORLDWIDE targeting - resolving location IDs for ${targetCountriesTiktok.length} countries...`);
        locationIds = await tiktokService.getLocationIds(targetCountriesTiktok);
        logger.info('tiktok', `Resolved ${locationIds.length} location IDs for WORLDWIDE targeting`);
      } else {
        const locationId = await tiktokService.getLocationId(campaign.country);
        locationIds = [locationId];
        logger.info('tiktok', `Resolved location ID for ${campaign.country}: ${locationId}`);
      }
    } catch (error: any) {
      logger.warn('tiktok', `Failed to resolve location IDs for ${campaign.country}. Using default/fallback if available, or erroring out.`, { error: error.message });
      throw error;
    }

    // Create Ad Group (according to TikTok Ads API)
    // Per user request: Use SCHEDULE_FROM_NOW (continuous, no end date)
    let startDate = new Date(platformConfig.startDateTime || platformConfig.startDate);
    const now = new Date();

    // TikTok requires start time to be in the future (at least slightly)
    // If start date is in the past or within next 10 mins, set to 15 mins from now
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    if (startDate < tenMinutesFromNow) {
      logger.info('tiktok', `⚠️ Start date ${startDate.toISOString()} is in the past or too soon. Adjusting to 15 mins from now.`);
      startDate = new Date(now.getTime() + 15 * 60 * 1000);
    }
    // NOTE: endDate is NOT used anymore - we use SCHEDULE_FROM_NOW (continuous)

    // Debug logging to understand the values
    // Nota: Con BID_TYPE_NO_BID, TikTok optimiza automáticamente (no necesitamos bid_price)
    logger.info('tiktok', `Ad Group Configuration:`, {
      budgetInDollars,
      pixelId: pixelId,
      optimization: 'CONVERSION with OCPM (auto-bid)'
    });

    // Create Ad Group parameters object
    // For WEB_CONVERSIONS objective, we use WEBSITE promotion_type and CONVERSION optimization
    //
    // IMPORTANTE: Siempre usar PLACEMENT_TIKTOK (requerimiento de la empresa - NO usar Pangle)
    // Nota: Si las imágenes no funcionan en PLACEMENT_TIKTOK, el usuario deberá usar video
    const adGroupParams: any = {
      advertiser_id: advertiserId,
      campaign_id: tiktokCampaign.campaign_id,
      adgroup_name: `${fullCampaignName} - ABO1`,
      promotion_type: 'WEBSITE', // WEBSITE for traffic to external URL
      // SIEMPRE usar PLACEMENT_TIKTOK (no usar Pangle ni automatic)
      placement_type: 'PLACEMENT_TYPE_NORMAL',
      placements: ['PLACEMENT_TIKTOK'],
      // SCHEDULE_FROM_NOW: Run continuously from start time with no end date
      schedule_type: 'SCHEDULE_FROM_NOW',
      schedule_start_time: startDate.toISOString().replace('T', ' ').split('.')[0],
      // NO schedule_end_time - campaign runs continuously
      budget_mode: 'BUDGET_MODE_DAY',
      budget: budgetInDollars, // TikTok API expects budget in DOLLARS (not cents!)
      // Configuración para CONVERSIONES (Sales)
      optimization_goal: 'CONVERT', // Optimizar para conversiones de ventas (TikTok usa 'CONVERT', no 'CONVERSION')
      billing_event: 'OCPM', // Optimized Cost Per Mille (requerido para conversiones)
      bid_type: 'BID_TYPE_NO_BID', // Sin CPA objetivo - TikTok optimiza automáticamente
      pacing: 'PACING_MODE_SMOOTH', // Standard delivery (requerido para BID_TYPE_NO_BID)
      // NO enviamos conversion_bid_price para que CPA objetivo quede vacío
      // Configuración de Pixel para conversiones (OBLIGATORIO)
      pixel_id: pixelId,
      optimization_event: 'SHOPPING', // Evento de compra/venta (TikTok usa 'SHOPPING', no 'COMPLETE_PAYMENT')
      location_ids: locationIds, // Use resolved Location IDs (87 for WORLDWIDE)
      operation_status: 'ENABLE', // Ad Group active, only ads are paused
    };

    // Add optional fields only if they have values
    if (tiktokAgeGroups.length > 0) {
      adGroupParams.age_groups = tiktokAgeGroups;
    }

    logger.info('tiktok', `Creating Ad Group with params:`, {
      ...adGroupParams
    });

    const adGroup = await tiktokService.createAdGroup(adGroupParams, accessToken);

    logger.success('tiktok', `TikTok ad group created with ID: ${adGroup.adgroup_id} `);

    // Get TikTok identity (OPTIONAL for non-Spark ads with custom identity/display_name)
    // Per user request: Use identity selected by user in wizard if available
    let identityId: string | null = null;
    let identityType: string | null = null;

    // Check if user selected an identity in the wizard
    if (platformConfig.tiktokIdentityId) {
      identityId = platformConfig.tiktokIdentityId;
      identityType = platformConfig.tiktokIdentityType || 'CUSTOMIZED_USER';
      logger.info('tiktok', `Using user-selected TikTok identity: ${identityId}, type: ${identityType}`);

      // Warn if CUSTOMIZED_USER is selected (deprecated in January 2026)
      if (identityType === 'CUSTOMIZED_USER') {
        logger.warn('tiktok', `⚠️ CUSTOMIZED_USER identity selected. This type will be deprecated by TikTok in January 2026. Consider linking a real TikTok account.`);
      }
    } else {
      // Fallback: Try to get identities if none was selected (for backwards compatibility)
      // Priority: BC_OWNED > AUTH_USER > CUSTOMIZED_USER (deprecated)
      try {
        const identities = await tiktokService.getIdentities(advertiserId, accessToken);
        logger.info('tiktok', `Identities response: ${JSON.stringify(identities)}`);

        // Prefer non-deprecated identity types (BC_OWNED, AUTH_USER) over CUSTOMIZED_USER
        const preferredIdentity = identities.identity_list?.find((identity: any) => {
          return identity.identity_id && (identity.identity_type === 'BC_OWNED' || identity.identity_type === 'AUTH_USER');
        });

        if (preferredIdentity) {
          identityId = preferredIdentity.identity_id;
          identityType = preferredIdentity.identity_type;
          logger.info('tiktok', `Using auto-selected TikTok identity (preferred): ${preferredIdentity.display_name} (${identityId}, type: ${identityType})`);
        } else {
          // Fallback to CUSTOMIZED_USER if no preferred identity found
          const fallbackIdentity = identities.identity_list?.find((identity: any) => {
            return identity.identity_id && identity.identity_type === 'CUSTOMIZED_USER';
          });

          if (fallbackIdentity) {
            identityId = fallbackIdentity.identity_id;
            identityType = fallbackIdentity.identity_type;
            logger.warn('tiktok', `⚠️ Using CUSTOMIZED_USER identity (deprecated in Jan 2026): ${fallbackIdentity.display_name} (${identityId}). Link a real TikTok account for future campaigns.`);
          } else {
            logger.info('tiktok', `No custom identity found. Will use display_name for non-Spark ads.`);
          }
        }
      } catch (identityError: any) {
        logger.warn('tiktok', `Failed to fetch identities: ${identityError.message}. Will use display_name for non-Spark ads.`);
      }
    }

    // FORMAT TONIC LINK
    // Use campaign.copyMaster (user-entered) instead of aiContent.copyMaster (AI-processed)
    const finalLink = this.formatTonicLink(
      campaign.tonicTrackingLink || 'https://example.com',
      'TIKTOK',
      campaign.copyMaster
    );

    logger.info('tiktok', `Using formatted Tonic link: ${finalLink} `);

    // Determine ad text - use manual value if provided, otherwise use AI-generated
    const adText = platformConfig.manualTiktokAdText || adCopy.primaryText;
    if (platformConfig.manualTiktokAdText) {
      logger.info('tiktok', `Using MANUAL ad text: "${adText}"`);
    } else {
      logger.info('tiktok', `Using AI-generated ad text: "${adText}"`);
    }

    // Upload videos and create ads
    // NOTA: TikTok PLACEMENT_TIKTOK solo soporta VIDEO
    const hasMultipleVideos = videos.length > 1;
    const createdAds: Array<{ adId: string; videoId: string }> = [];
    let ad: any;

    logger.info('tiktok', `Processing ${videos.length} video(s) for TikTok ads...`, {
      hasMultipleVideos,
      videoCount: videos.length,
    });

    // Process each video and create an ad for it
    for (let idx = 0; idx < videos.length; idx++) {
      const video = videos[idx];
      logger.info('tiktok', `Processing video ${idx + 1}/${videos.length}: ${video.fileName}`);

      // Generate unique filename for video
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const uniqueFileName = video.fileName.replace(/\.[^/.]+$/, `_tiktok_${timestamp}_${randomString}$&`);

      // Upload video to TikTok
      const uploadResult = await tiktokService.uploadVideo({
        advertiser_id: advertiserId,
        upload_type: 'UPLOAD_BY_URL',
        video_url: video.url,
        file_name: uniqueFileName,
        auto_bind_enabled: true,
        auto_fix_enabled: true,
      }, accessToken);

      // TikTok API returns an ARRAY with the video info
      const videoInfo = Array.isArray(uploadResult) ? uploadResult[0] : uploadResult;
      const videoId = videoInfo?.video_id;
      const videoCoverUrl = videoInfo?.video_cover_url;

      logger.info('tiktok', `Video ${idx + 1} upload response:`, {
        video_id: videoId,
        video_cover_url: videoCoverUrl,
        file_name: videoInfo?.file_name,
        duration: videoInfo?.duration,
      });

      if (!videoId) {
        logger.error('tiktok', `TikTok video upload did not return a video_id! Full response:`, uploadResult);
        throw new Error(`TikTok video upload failed for ${video.fileName} - no video_id returned.`);
      }

      // Update media record
      await prisma.media.update({
        where: { id: video.id },
        data: {
          usedInTiktok: true,
          tiktokVideoId: videoId,
        },
      });

      logger.success('tiktok', `Video ${idx + 1} uploaded successfully`, { videoId });

      // Wait for TikTok to process the video
      logger.info('tiktok', `Waiting 15 seconds for TikTok to process video ${idx + 1}...`);
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Upload thumbnail image for SINGLE_VIDEO ad (REQUIRED by TikTok API)
      // TikTok requires image_ids for video ads - the image is used as the video cover/thumbnail
      // Aspect ratio of thumbnail MUST match the video aspect ratio
      let thumbnailImageId: string | null = null;
      let effectiveCoverUrl = videoCoverUrl;

      // If video_cover_url was not returned initially, try to fetch it from TikTok
      // The cover URL may not be immediately available after upload
      if (!effectiveCoverUrl) {
        logger.info('tiktok', `No cover URL from upload, fetching video info to get cover URL...`);
        const maxCoverRetries = 3;
        for (let retry = 0; retry < maxCoverRetries; retry++) {
          const videoInfoResult = await tiktokService.getVideoInfo(advertiserId, videoId, accessToken);
          if (videoInfoResult?.video_cover_url) {
            effectiveCoverUrl = videoInfoResult.video_cover_url;
            logger.success('tiktok', `Got video cover URL on retry ${retry + 1}`, { effectiveCoverUrl });
            break;
          }
          if (retry < maxCoverRetries - 1) {
            const waitTime = 10000 * (retry + 1); // 10s, 20s, 30s
            logger.info('tiktok', `Cover URL not ready, waiting ${waitTime / 1000}s before retry ${retry + 2}...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      if (effectiveCoverUrl) {
        // Try multiple times to download and upload the thumbnail
        const maxThumbnailAttempts = 3;
        for (let attempt = 0; attempt < maxThumbnailAttempts; attempt++) {
          try {
            logger.info('tiktok', `Uploading thumbnail for video ${idx + 1} (attempt ${attempt + 1}/${maxThumbnailAttempts})...`);

            // Download the image from TikTok's CDN first, then upload as file
            // This is more reliable than UPLOAD_BY_URL which can fail with "Unsupported image size"
            const axios = (await import('axios')).default;
            const imageResponse = await axios.get(effectiveCoverUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              },
            });

            const imageBuffer = Buffer.from(imageResponse.data);
            logger.info('tiktok', `Downloaded thumbnail image: ${imageBuffer.length} bytes`);

            // Upload the image buffer to TikTok
            const thumbnailUploadResult = await tiktokService.uploadImage(
              imageBuffer,
              `${uniqueFileName.replace('.mp4', '')}_thumbnail.jpg`,
              'UPLOAD_BY_FILE',
              accessToken,
              advertiserId  // Pass the correct advertiser ID
            );

            const thumbnailInfo = Array.isArray(thumbnailUploadResult) ? thumbnailUploadResult[0] : thumbnailUploadResult;
            thumbnailImageId = thumbnailInfo?.image_id;

            if (thumbnailImageId) {
              logger.success('tiktok', `Thumbnail ${idx + 1} uploaded successfully`, { thumbnailImageId });
              break; // Success, exit retry loop
            } else {
              logger.warn('tiktok', `Thumbnail ${idx + 1} upload did not return image_id`, thumbnailUploadResult);
            }
          } catch (thumbError: any) {
            logger.error('tiktok', `Thumbnail upload attempt ${attempt + 1} failed: ${thumbError.message}`);
            if (attempt < maxThumbnailAttempts - 1) {
              const waitTime = 5000 * (attempt + 1);
              logger.info('tiktok', `Waiting ${waitTime / 1000}s before thumbnail retry...`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          }
        }
      } else {
        logger.error('tiktok', `No video_cover_url available for video ${idx + 1} after all retries`);
      }

      // CRITICAL: TikTok REQUIRES image_ids for SINGLE_VIDEO ads
      // If we don't have a thumbnail, throw a clear error instead of letting TikTok fail with error 40002
      if (!thumbnailImageId) {
        throw new Error(
          `TikTok requiere una imagen de miniatura (thumbnail) para anuncios de video. ` +
          `No se pudo obtener la miniatura del video "${video.fileName}". ` +
          `Por favor, intenta subir el video nuevamente o contacta soporte si el problema persiste.`
        );
      }

      // Create Ad with retry logic
      logger.info('tiktok', `Creating TikTok ad ${idx + 1}/${videos.length}...`);

      let adCreationAttempts = 0;
      const maxAdCreationAttempts = 3;
      const baseDelay = 20000;

      while (adCreationAttempts < maxAdCreationAttempts) {
        try {
          // Build ad params for SINGLE_VIDEO ad
          const adParams: any = {
            advertiser_id: advertiserId,
            adgroup_id: adGroup.adgroup_id,
            ad_name: hasMultipleVideos ? `${getTomorrowDate()}_${idx + 1}` : getTomorrowDate(),
            ad_format: 'SINGLE_VIDEO',
            ad_text: adText,
            call_to_action: adCopy.callToAction || 'LEARN_MORE',
            landing_page_url: finalLink,
            display_name: campaign.offer.name,
            video_id: videoId,
            operation_status: 'DISABLE', // Ad paused (only ads are paused)
          };

          // Add thumbnail image_ids if available (REQUIRED for SINGLE_VIDEO ads)
          // The image aspect ratio must match the video aspect ratio
          if (thumbnailImageId) {
            adParams.image_ids = [thumbnailImageId];
            logger.info('tiktok', `Using thumbnail image_id: ${thumbnailImageId}`);
          } else {
            logger.warn('tiktok', `No thumbnail available for ad ${idx + 1} - TikTok may reject the ad creation`);
          }

          if (identityId && identityType && identityType !== 'ADVERTISER') {
            adParams.identity_id = identityId;
            adParams.identity_type = identityType;
          }

          logger.info('tiktok', `Creating ad ${idx + 1} with params:`, adParams);

          ad = await tiktokService.createAd(adParams, accessToken);

          createdAds.push({ adId: ad.ad_id, videoId });
          logger.success('tiktok', `TikTok ad ${idx + 1}/${videos.length} created successfully with ID: ${ad.ad_id}`);
          break;

        } catch (adError: any) {
          adCreationAttempts++;

          if (adCreationAttempts < maxAdCreationAttempts) {
            const delay = baseDelay * Math.pow(2, adCreationAttempts - 1);
            logger.warn('tiktok',
              `Video ${idx + 1} may still be processing (attempt ${adCreationAttempts}/${maxAdCreationAttempts}). ` +
              `Waiting ${delay / 1000} seconds...`, { error: adError.message });
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            logger.error('tiktok', `Failed to create ad ${idx + 1} after ${adCreationAttempts} attempts`, {
              error: adError.message,
              videoId,
            });
            throw adError;
          }
        }
      }
    }

    if (createdAds.length === 0) {
      throw new Error('Failed to create any TikTok ads');
    }

    logger.success('tiktok', `All ${createdAds.length} TikTok ad(s) created successfully`);

    // Use the last created ad for the return value
    const lastAd = createdAds[createdAds.length - 1];

    // Update database (using last created ad for reference)
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
        tiktokAdId: lastAd.adId,
        status: CampaignStatus.ACTIVE,
      },
    });

    logger.success('tiktok', 'TikTok campaign launched successfully', {
      campaignId: tiktokCampaign.campaign_id,
      adGroupId: adGroup.adgroup_id,
      totalAds: createdAds.length,
      adIds: createdAds.map(a => a.adId),
      adFormat,
    });

    return {
      platform: Platform.TIKTOK,
      success: true,
      campaignId: tiktokCampaign.campaign_id,
      adGroupId: adGroup.adgroup_id,
      adId: lastAd.adId,
    };
  }

  /**
   * Launch campaign to Taboola
   *
   * Taboola uses "Backstage API" (aka Realize) for campaign management.
   * Campaign hierarchy: Campaign → Items (Ads)
   *
   * NOTE: This is a placeholder implementation. Full integration requires:
   * 1. Taboola API credentials (client_id, client_secret)
   * 2. Taboola account_id
   * 3. These will be configured when the user provides them
   */
  private async launchToTaboola(campaign: any, platformConfig: any, aiContent: any, tonicCampaignId?: string) {
    logger.info('taboola', 'Starting Taboola campaign launch...', { campaignId: campaign.id });

    try {
      // Get the Taboola account from DB
      const taboolaAccount = await prisma.account.findFirst({
        where: {
          id: platformConfig.taboolaAccountId,
          accountType: 'TABOOLA',
          isActive: true,
        },
      });

      if (!taboolaAccount) {
        throw new Error('Taboola account not found or inactive');
      }

      // Check if Taboola credentials are configured
      if (!taboolaAccount.taboolaAccountId || !taboolaAccount.taboolaAccessToken) {
        logger.warn('taboola', 'Taboola API credentials not configured. Skipping Taboola launch.', {
          hasAccountId: !!taboolaAccount.taboolaAccountId,
          hasAccessToken: !!taboolaAccount.taboolaAccessToken,
        });

        // Update CampaignPlatform status to indicate pending configuration
        await prisma.campaignPlatform.update({
          where: {
            campaignId_platform: {
              campaignId: campaign.id,
              platform: Platform.TABOOLA,
            },
          },
          data: {
            status: CampaignStatus.DRAFT,
            taboolaBidStrategy: platformConfig.taboolaBidStrategy,
            taboolaCpc: platformConfig.taboolaCpc,
            taboolaBrandingText: platformConfig.taboolaBrandingText,
          },
        });

        return {
          platform: Platform.TABOOLA,
          success: false,
          error: 'Taboola API credentials not configured. Please configure your Taboola account credentials.',
        };
      }

      // Import and use Taboola service
      const { TaboolaService } = await import('./taboola.service');
      const taboolaService = TaboolaService.withAccount(
        taboolaAccount.taboolaAccountId,
        taboolaAccount.taboolaAccessToken
      );

      // Get tracking link
      const trackingLink = campaign.tonicTrackingLink || `https://example.com/track/${campaign.id}`;

      // Generate ad copy for Taboola (uses similar format to Meta)
      const adCopy = aiContent?.adCopy || {
        headline: campaign.name,
        description: campaign.communicationAngle || 'Learn more',
      };

      // Create Taboola campaign
      // Resolve country codes - WORLDWIDE expands to all 87 allowed countries
      const taboolaTargetCountries = resolveCountryCodes(campaign.country);
      logger.info('taboola', `Targeting ${taboolaTargetCountries.length} country(ies): ${isWorldwide(campaign.country) ? 'WORLDWIDE' : campaign.country}`);

      const taboolaCampaign = await taboolaService.createCampaign({
        name: campaign.name,
        branding_text: platformConfig.taboolaBrandingText || 'Sponsored',
        marketing_objective: platformConfig.performanceGoal === 'Traffic' ? 'DRIVE_WEBSITE_TRAFFIC' : 'LEADS_GENERATION',
        bid_strategy: platformConfig.taboolaBidStrategy || 'MAX_CONVERSIONS',
        cpc: platformConfig.taboolaBidStrategy === 'FIXED' ? platformConfig.taboolaCpc : undefined,
        spending_limit: platformConfig.budget * 30, // Monthly budget (daily * 30)
        spending_limit_model: 'MONTHLY',
        country_targeting: {
          type: 'INCLUDE',
          value: taboolaTargetCountries, // WORLDWIDE = 87 countries
        },
        is_active: false, // Start paused, activate after item is ready
      });

      logger.info('taboola', 'Taboola campaign created', { campaignId: taboolaCampaign.id });

      // Create campaign item (ad) with the tracking URL
      logger.info('taboola', 'Creating Taboola campaign item...');
      const taboolaItem = await taboolaService.createItem(
        taboolaCampaign.id,
        trackingLink,
        taboolaAccount.taboolaAccountId
      );

      logger.info('taboola', 'Taboola item created', { itemId: taboolaItem.id, status: taboolaItem.status });

      // Wait for item to finish crawling (up to 60 seconds)
      logger.info('taboola', 'Waiting for item to finish crawling...');
      try {
        const readyItem = await taboolaService.waitForItemReady(
          taboolaCampaign.id,
          taboolaItem.id,
          60000, // 60 second timeout
          5000,  // poll every 5 seconds
          taboolaAccount.taboolaAccountId
        );

        // Update item with ad copy if crawling completed
        if (readyItem.status !== 'CRAWLING') {
          logger.info('taboola', 'Updating item with ad copy...');
          await taboolaService.updateItem(
            taboolaCampaign.id,
            taboolaItem.id,
            {
              title: adCopy.headline,
              description: adCopy.description,
            },
            taboolaAccount.taboolaAccountId
          );
        }
      } catch (waitError: any) {
        logger.warn('taboola', 'Item still crawling after timeout, will be updated later', {
          error: waitError.message,
        });
      }

      // Activate the campaign
      logger.info('taboola', 'Activating Taboola campaign...');
      await taboolaService.resumeCampaign(taboolaCampaign.id, taboolaAccount.taboolaAccountId);

      // Update database
      await prisma.campaignPlatform.update({
        where: {
          campaignId_platform: {
            campaignId: campaign.id,
            platform: Platform.TABOOLA,
          },
        },
        data: {
          taboolaCampaignId: taboolaCampaign.id,
          taboolaItemId: taboolaItem.id,
          taboolaBidStrategy: platformConfig.taboolaBidStrategy,
          taboolaCpc: platformConfig.taboolaCpc,
          taboolaBrandingText: platformConfig.taboolaBrandingText,
          status: CampaignStatus.ACTIVE,
        },
      });

      logger.success('taboola', 'Taboola campaign launched successfully', {
        campaignId: taboolaCampaign.id,
        itemId: taboolaItem.id,
      });

      return {
        platform: Platform.TABOOLA,
        success: true,
        campaignId: taboolaCampaign.id,
        adId: taboolaItem.id,
      };

    } catch (error: any) {
      logger.error('taboola', `Failed to launch Taboola campaign: ${error.message}`, {
        campaignId: campaign.id,
        error: error.message,
        stack: error.stack,
      });

      // Update CampaignPlatform with error status
      await prisma.campaignPlatform.update({
        where: {
          campaignId_platform: {
            campaignId: campaign.id,
            platform: Platform.TABOOLA,
          },
        },
        data: {
          status: CampaignStatus.FAILED,
          taboolaBidStrategy: platformConfig.taboolaBidStrategy,
          taboolaCpc: platformConfig.taboolaCpc,
          taboolaBrandingText: platformConfig.taboolaBrandingText,
        },
      });

      return {
        platform: Platform.TABOOLA,
        success: false,
        error: error.message,
      };
    }
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
            // AI media settings (loaded from DB)
            aiMediaType: platformConfig.aiMediaType,
            aiMediaCount: platformConfig.aiMediaCount,
            adsPerAdSet: platformConfig.adsPerAdSet || 1, // For ABO: ads per ad set
            // Manual Ad Copy (loaded from DB)
            manualAdCopy: {
              adTitle: platformConfig.manualAdTitle,
              description: platformConfig.manualDescription,
              primaryText: platformConfig.manualPrimaryText,
            },
            // Manual Ad Copy for TikTok
            manualTiktokAdText: platformConfig.manualTiktokAdText,
            // User-selected Fan Page/Identity (loaded from DB)
            metaPageId: platformConfig.metaPageId,
            tiktokIdentityId: platformConfig.tiktokIdentityId,
            tiktokIdentityType: platformConfig.tiktokIdentityType,
            // Special Ad Categories for Meta
            specialAdCategories: platformConfig.specialAdCategories || [],
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

      // Build errorDetails if there are failures
      const failedPlatformsAsync = platformResults.filter(r => !r.success);
      const errorDetailsAsync = !allSuccessful && failedPlatformsAsync.length > 0 ? {
        step: 'platform-launch',
        message: failedPlatformsAsync.map(p => `${p.platform}: ${'error' in p ? p.error : 'Unknown error'}`).join('; '),
        timestamp: new Date().toISOString(),
        platform: failedPlatformsAsync.map(p => p.platform).join(', '),
        technicalDetails: JSON.stringify(failedPlatformsAsync, null, 2),
      } : undefined;

      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: allSuccessful ? CampaignStatus.ACTIVE : CampaignStatus.FAILED,
          launchedAt: new Date(),
          ...(errorDetailsAsync && { errorDetails: errorDetailsAsync }),
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

      // Update campaign status to FAILED with errorDetails
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'platform-launch',
            message: error.message,
            timestamp: new Date().toISOString(),
            technicalDetails: error.stack || error.message,
          },
        },
      });

      throw new Error(`Failed to launch campaign to platforms: ${error.message} `);
    }
  }

  /**
   * Create campaign quickly for async processing
   *
   * This method creates the campaign in DB and submits the article request to Tonic,
   * but does NOT wait for approval. Returns immediately with PENDING_ARTICLE status.
   *
   * Used by the new async architecture where cron jobs handle the rest.
   */
  async createCampaignQuick(params: CreateCampaignParams): Promise<{
    campaignId: string;
    status: CampaignStatus;
    articleRequestId?: number;
  }> {
    logger.info('system', '🚀 Creating campaign (quick async mode)...', {
      name: params.name,
      country: params.country,
    });

    // Get Tonic credentials
    const tonicAccount = await prisma.account.findUnique({
      where: { id: params.tonicAccountId },
    });

    if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      throw new Error(`Tonic account ${params.tonicAccountId} not found or missing credentials.`);
    }

    const credentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    // Get or create offer
    let offer = await prisma.offer.findUnique({ where: { tonicId: params.offerId } });

    // Fetch offer details from Tonic to get/update vertical
    const tonicOffers = await tonicService.getOffers(credentials, 'display');
    const tonicOffer = tonicOffers.find((o: any) => o.id == params.offerId);

    if (tonicOffer) {
      // Log all offer fields from Tonic to debug vertical field name
      logger.info('tonic', 'Tonic offer data received (simple launch):', {
        id: tonicOffer.id,
        name: tonicOffer.name,
        vertical: tonicOffer.vertical,
        category: tonicOffer.category,
        niche: tonicOffer.niche,
        offer_vertical: tonicOffer.offer_vertical,
        type: tonicOffer.type,
        allFields: Object.keys(tonicOffer),
      });
    }

    // Tonic API may return vertical in different fields
    const offerVertical = tonicOffer?.vertical || tonicOffer?.category || tonicOffer?.niche || tonicOffer?.offer_vertical || tonicOffer?.type || 'General';

    if (!offer) {
      if (!tonicOffer) {
        throw new Error(`Offer ${params.offerId} not found in Tonic`);
      }
      offer = await prisma.offer.create({
        data: {
          tonicId: params.offerId,
          name: tonicOffer.name,
          vertical: offerVertical,
          description: tonicOffer.description,
        },
      });
      logger.info('system', 'Created new offer in database', { offerId: offer.id, vertical: offerVertical });
    } else if (offer.vertical === 'Unknown' || offer.vertical === 'General' || !offer.vertical) {
      // Update existing offer if vertical is missing or generic
      offer = await prisma.offer.update({
        where: { id: offer.id },
        data: { vertical: offerVertical },
      });
      logger.info('system', 'Updated offer vertical in database', { offerId: offer.id, vertical: offerVertical });
    }

    // Detect campaign type (RSOC vs Display)
    let campaignType: 'rsoc' | 'display' = 'display';
    let rsocDomain: string | null = null;

    if (tonicAccount.tonicSupportsRSOC && tonicAccount.tonicRSOCDomains) {
      const rsocDomains = tonicAccount.tonicRSOCDomains as any[];
      const compatibleDomain = rsocDomains.find((d: any) =>
        d.languages?.includes(params.language.toLowerCase())
      );
      if (compatibleDomain) {
        campaignType = 'rsoc';
        rsocDomain = compatibleDomain.domain;
      }
    }

    // Create campaign in DB
    const campaign = await prisma.campaign.create({
      data: {
        name: params.name,
        status: CampaignStatus.DRAFT,
        campaignType: params.campaignType,
        createdById: params.createdById, // Owner - Manager who created this campaign
        offerId: offer.id,
        country: params.country,
        language: params.language,
        copyMaster: params.copyMaster,
        communicationAngle: params.communicationAngle,
        keywords: params.keywords || [],
        contentGenerationPhrases: params.contentGenerationPhrases || [],
        // DesignFlow configuration (used when article is approved by Tonic cron job)
        needsDesignFlow: params.needsDesignFlow ?? false,
        designFlowRequester: params.designFlowRequester || 'Harry',
        designFlowNotes: params.designFlowNotes,
        platforms: {
          create: params.platforms.map((p) => ({
            platform: p.platform,
            tonicAccountId: p.platform === 'TONIC' ? params.tonicAccountId : null,
            metaAccountId: p.platform === 'META' ? p.accountId : null,
            tiktokAccountId: p.platform === 'TIKTOK' ? p.accountId : null,
            performanceGoal: p.performanceGoal,
            budget: p.budget,
            startDate: p.startDate,
            generateWithAI: p.generateWithAI,
            aiMediaType: p.aiMediaType || (p.platform === 'TIKTOK' ? 'VIDEO' : 'IMAGE'),
            aiMediaCount: Number(p.aiMediaCount) || 1,
            adsPerAdSet: Number(p.adsPerAdSet) || 1,
            specialAdCategories: p.specialAdCategories || [],
            metaPageId: p.metaPageId,
            tiktokIdentityId: p.tiktokIdentityId,
            tiktokIdentityType: p.tiktokIdentityType,
            manualAdTitle: p.manualAdCopy?.adTitle,
            manualDescription: p.manualAdCopy?.description,
            manualPrimaryText: p.manualAdCopy?.primaryText,
            manualTiktokAdText: p.manualTiktokAdText,
          })),
        },
      },
      include: { platforms: true },
    });

    // Also create TONIC platform entry for tracking
    const hasTonicPlatform = campaign.platforms.some(p => p.platform === 'TONIC');
    if (!hasTonicPlatform) {
      await prisma.campaignPlatform.create({
        data: {
          campaignId: campaign.id,
          platform: 'TONIC',
          tonicAccountId: params.tonicAccountId,
        },
      });
    }

    logger.success('system', `Campaign created in DB: ${campaign.id}`);

    // For RSOC campaigns, handle article (new or existing)
    let articleRequestId: number | undefined;

    if (campaignType === 'rsoc' && rsocDomain) {
      // Check if we're reusing an existing headline
      if (params.rsocMode === 'existing' && params.selectedHeadlineId) {
        // REUSE EXISTING HEADLINE - Skip article creation, go directly to ARTICLE_APPROVED
        logger.info('tonic', `Reusing existing RSOC headline: ${params.selectedHeadlineId}`);

        // Store the headline ID as the article ID (it's the same thing in Tonic's system)
        await prisma.campaign.update({
          where: { id: campaign.id },
          data: {
            status: CampaignStatus.ARTICLE_APPROVED,
            tonicArticleId: params.selectedHeadlineId.toString(),
          },
        });

        logger.success('tonic', `Using existing headline ID: ${params.selectedHeadlineId} - Campaign ready for processing`);

        return {
          campaignId: campaign.id,
          status: CampaignStatus.ARTICLE_APPROVED,
          articleRequestId: params.selectedHeadlineId,
        };
      }

      // NEW ARTICLE - Create article request in Tonic
      logger.info('tonic', 'Creating RSOC article request (async mode)...');

      // Generate content phrases and headline using AI
      let contentPhrases = params.contentGenerationPhrases || [];
      let headline = '';

      if (contentPhrases.length === 0) {
        // Generate article content with AI (includes headline and phrases)
        const articleContent = await aiService.generateArticle({
          offerName: offer.name,
          copyMaster: params.copyMaster || `Discover the best deals on ${offer.name}`,
          keywords: params.keywords || [],
          country: params.country,
          language: params.language,
        });
        contentPhrases = articleContent.contentGenerationPhrases;
        headline = articleContent.headline;
      } else {
        // Manual phrases provided, just generate headline
        const articleContent = await aiService.generateArticle({
          offerName: offer.name,
          copyMaster: params.copyMaster || `Discover the best deals on ${offer.name}`,
          keywords: params.keywords || [],
          country: params.country,
          language: params.language,
        });
        headline = articleContent.headline;
      }

      // Create article request in Tonic (returns immediately)
      articleRequestId = await tonicService.createArticleRequest(credentials, {
        offer_id: parseInt(params.offerId),
        country: params.country,
        language: params.language,
        domain: rsocDomain,
        content_generation_phrases: contentPhrases,
        headline: headline,
      });

      logger.success('tonic', `Article request created: ${articleRequestId}`);

      // Update campaign with article request ID and set to PENDING
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: CampaignStatus.PENDING_ARTICLE,
          tonicArticleRequestId: articleRequestId.toString(),
        },
      });

      return {
        campaignId: campaign.id,
        status: CampaignStatus.PENDING_ARTICLE,
        articleRequestId,
      };
    } else {
      // Display campaign - no article needed, go straight to ARTICLE_APPROVED
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.ARTICLE_APPROVED },
      });

      return {
        campaignId: campaign.id,
        status: CampaignStatus.ARTICLE_APPROVED,
      };
    }
  }

  /**
   * Continue campaign processing after article approval
   *
   * Called by cron job when campaign transitions from PENDING_ARTICLE to ARTICLE_APPROVED.
   * Handles: Tonic campaign creation, tracking link, AI content, platform launch.
   */
  async continueCampaignAfterArticle(campaignId: string): Promise<LaunchResult> {
    logger.info('system', `🔄 Continuing campaign after article approval: ${campaignId}`);

    // Get campaign with all related data
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        platforms: {
          include: {
            tonicAccount: true,
            metaAccount: true,
            tiktokAccount: true,
          },
        },
        offer: true,
        media: true,
      },
    });

    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    // Get Tonic credentials
    const tonicPlatform = campaign.platforms.find(p => p.platform === 'TONIC');
    const tonicAccount = tonicPlatform?.tonicAccount;

    if (!tonicAccount || !tonicAccount.tonicConsumerKey || !tonicAccount.tonicConsumerSecret) {
      throw new Error(`Campaign ${campaignId} missing Tonic credentials`);
    }

    const credentials = {
      consumer_key: tonicAccount.tonicConsumerKey,
      consumer_secret: tonicAccount.tonicConsumerSecret,
    };

    // Detect campaign type
    let campaignType: 'rsoc' | 'display' = 'display';
    if (campaign.tonicArticleId) {
      campaignType = 'rsoc';
    }

    const errors: string[] = [];
    let tonicCampaignId: string | number | undefined = undefined;

    // ============================================
    // STEP 1: Create Tonic campaign (or use existing)
    // ============================================

    // Check if Tonic campaign was already created (e.g., by check-articles cron)
    if (campaign.tonicCampaignId) {
      logger.info('tonic', `✅ Tonic campaign already exists: ${campaign.tonicCampaignId}, skipping creation`);
      tonicCampaignId = campaign.tonicCampaignId;
    } else {
      // DEFENSIVE CHECK: Search for existing campaign in Tonic by name
      // This handles the case where the campaign was created but tonicCampaignId wasn't saved to DB
      // (e.g., if check-articles created the campaign but failed to save the ID)
      logger.info('tonic', 'Checking if Tonic campaign already exists by name...');

      let existingCampaignFound = false;
      const statesToCheck = ['active', 'pending', 'incomplete'] as const;

      for (const state of statesToCheck) {
        if (existingCampaignFound) break;
        try {
          const existingCampaigns = await tonicService.getCampaignList(credentials, state);
          const existing = existingCampaigns.find((c: any) => c.name === campaign.name);

          if (existing) {
            logger.info('tonic', `✅ Found existing Tonic campaign in '${state}' state: ${existing.id}`);
            tonicCampaignId = existing.id;
            existingCampaignFound = true;

            // Save to DB for future use
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { tonicCampaignId: String(existing.id) }
            });
            logger.info('tonic', `Saved existing tonicCampaignId to DB: ${existing.id}`);
          }
        } catch (searchError) {
          logger.warn('tonic', `Could not search ${state} campaigns: ${searchError}`);
          // Continue to next state
        }
      }

      // If no existing campaign found, create a new one
      if (!existingCampaignFound) {
        logger.info('tonic', `Creating ${campaignType.toUpperCase()} campaign in Tonic...`);

        // Use the original campaign name - NO SUFFIX EVER
        // If Tonic rejects due to duplicate name, let it fail
        // User must choose a different name to preserve Looker Studio compatibility
        const campaignParams = {
          name: campaign.name,
          offer: campaign.offer.name,
          offer_id: campaign.offer.tonicId,
          country: campaign.country,
          type: campaignType,
          return_type: 'id' as const,
          ...(campaign.tonicArticleId && { headline_id: campaign.tonicArticleId }),
        };

        tonicCampaignId = await tonicService.createCampaign(credentials, campaignParams);
        logger.success('tonic', `Tonic campaign created: ${tonicCampaignId}`);
      }
    }

    // ============================================
    // STEP 2: Wait for tracking link
    // ============================================

    // Verify tonicCampaignId was assigned (should always be true at this point)
    if (!tonicCampaignId) {
      throw new Error('Failed to create or find Tonic campaign - tonicCampaignId is undefined');
    }

    logger.info('tonic', '⏳ Waiting for tracking link...');

    const trackingLinkResult = await waitForTrackingLink(
      credentials,
      tonicCampaignId.toString(),
      {
        maxWaitMinutes: 15,
        pollingIntervalSeconds: 30,
      }
    );

    let trackingLink: string;
    if (trackingLinkResult.success && trackingLinkResult.trackingLink) {
      trackingLink = trackingLinkResult.trackingLink;

      // Try to get Direct Link
      try {
        const campaignList = await tonicService.getCampaignList(credentials, 'active');
        const tonicCampaign = campaignList.find((c: any) => c.id == tonicCampaignId);
        if (tonicCampaign?.direct_link) {
          trackingLink = tonicCampaign.direct_link;
        }
      } catch (e) {
        // Use regular tracking link
      }

      logger.success('tonic', `Tracking link obtained: ${trackingLink}`);
    } else {
      trackingLink = `https://tonic-placeholder.com/campaign/${tonicCampaignId}`;
      errors.push('Tracking link not available, using placeholder');
    }

    // Update campaign with Tonic info
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        tonicCampaignId: tonicCampaignId.toString(),
        tonicTrackingLink: trackingLink,
      },
    });

    // ============================================
    // STEP 2.5: Refresh offer vertical from Tonic CAMPAIGN if needed
    // ============================================
    // The vertical is available in the CAMPAIGN data from Tonic (not the offers list)
    // According to Tonic API docs: /privileged/v3/campaign/list returns "vertical" field
    if (!campaign.offer.vertical || campaign.offer.vertical === 'General' || campaign.offer.vertical === 'Unknown') {
      logger.info('tonic', `Offer vertical is "${campaign.offer.vertical}", attempting to refresh from Tonic CAMPAIGN...`);

      try {
        // Get campaigns from Tonic - the vertical is in the CAMPAIGN data, not offers
        const campaignList = await tonicService.getCampaignList(credentials, 'active');

        // Find our campaign by ID
        const tonicCampaign = campaignList?.find((c: any) =>
          c.id?.toString() === tonicCampaignId.toString()
        );

        if (tonicCampaign) {
          // Log ALL fields from Tonic campaign for debugging
          logger.info('tonic', '📋 Tonic CAMPAIGN fields (for vertical refresh):', {
            id: tonicCampaign.id,
            name: tonicCampaign.name,
            vertical: tonicCampaign.vertical,
            offer: tonicCampaign.offer,
            offer_id: tonicCampaign.offer_id,
            country: tonicCampaign.country,
            type: tonicCampaign.type,
            allFields: Object.keys(tonicCampaign),
            allValues: JSON.stringify(tonicCampaign).substring(0, 500),
          });

          // The vertical should be directly in the campaign data
          const refreshedVertical = tonicCampaign.vertical;

          if (refreshedVertical && refreshedVertical !== 'General' && refreshedVertical !== 'Unknown') {
            logger.success('tonic', `✅ Found real vertical from Tonic campaign: "${refreshedVertical}"`);

            // Update the offer in the database
            await prisma.offer.update({
              where: { id: campaign.offer.id },
              data: { vertical: refreshedVertical },
            });

            // Update our local campaign object
            campaign.offer.vertical = refreshedVertical;

            logger.success('system', `Updated offer vertical in DB: "${refreshedVertical}"`);
          } else {
            logger.warn('tonic', `Tonic campaign has no valid vertical. Value: "${refreshedVertical}". Fields available: ${Object.keys(tonicCampaign).join(', ')}`);
          }
        } else {
          logger.warn('tonic', `Campaign ${tonicCampaignId} not found in Tonic campaign list`);

          // Fallback: Try to find by offer_id in the campaign list
          const campaignByOffer = campaignList?.find((c: any) =>
            c.offer_id?.toString() === campaign.offer.tonicId
          );

          if (campaignByOffer && campaignByOffer.vertical) {
            logger.success('tonic', `✅ Found vertical via offer_id fallback: "${campaignByOffer.vertical}"`);

            await prisma.offer.update({
              where: { id: campaign.offer.id },
              data: { vertical: campaignByOffer.vertical },
            });

            campaign.offer.vertical = campaignByOffer.vertical;
            logger.success('system', `Updated offer vertical in DB: "${campaignByOffer.vertical}"`);
          }
        }
      } catch (error: any) {
        logger.warn('tonic', `Failed to refresh vertical from Tonic: ${error.message}`);
      }
    }

    // ============================================
    // STEP 3: Generate AI Content
    // ============================================
    logger.info('ai', 'Generating AI content...');

    const aiContentResult: any = {};

    // Generate Copy Master if not set
    if (!campaign.copyMaster) {
      aiContentResult.copyMaster = await aiService.generateCopyMaster({
        offerName: campaign.offer.name,
        offerDescription: campaign.offer.description || undefined,
        vertical: campaign.offer.vertical,
        country: campaign.country,
        language: campaign.language,
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { copyMaster: aiContentResult.copyMaster },
      });
    } else {
      aiContentResult.copyMaster = campaign.copyMaster;
    }

    // Generate Keywords if not set
    if (!campaign.keywords || campaign.keywords.length === 0) {
      aiContentResult.keywords = await aiService.generateKeywords({
        offerName: campaign.offer.name,
        copyMaster: aiContentResult.copyMaster,
        count: 6,
        country: campaign.country,
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { keywords: aiContentResult.keywords },
      });
    } else {
      aiContentResult.keywords = campaign.keywords;
    }

    // Set keywords in Tonic
    await tonicService.setKeywords(credentials, {
      campaign_id: parseInt(tonicCampaignId.toString()),
      keywords: aiContentResult.keywords,
      keyword_amount: aiContentResult.keywords.length,
    });

    logger.success('ai', 'AI content generated and keywords set');

    // ============================================
    // STEP 3.5: Generate AI Media (Images/Videos) if enabled
    // ============================================
    for (const platformConfig of campaign.platforms) {
      if (!platformConfig.generateWithAI) {
        logger.info('ai', `⏭️  Skipping AI media generation for ${platformConfig.platform} (manual upload mode)`);
        continue;
      }

      // Skip Tonic platform (only generate media for Meta/TikTok)
      if (platformConfig.platform === 'TONIC') {
        continue;
      }

      // Check if media already exists for this campaign
      const existingMedia = await prisma.media.count({
        where: { campaignId: campaign.id },
      });

      if (existingMedia > 0) {
        logger.info('ai', `⏭️  Media already exists for ${platformConfig.platform}, skipping generation`);
        continue;
      }

      // Get media type and count from platform config
      const mediaType = platformConfig.aiMediaType || (platformConfig.platform === 'TIKTOK' ? 'VIDEO' : 'IMAGE');
      const mediaCount = platformConfig.aiMediaCount || 1;

      // DEBUG: Log para verificar el valor de aiMediaCount desde BD
      logger.info('ai', `📊 DEBUG: Platform ${platformConfig.platform} - aiMediaCount from DB: ${platformConfig.aiMediaCount}, resolved mediaCount: ${mediaCount}`);

      // TikTok only allows videos - enforce this
      const effectiveMediaType = platformConfig.platform === 'TIKTOK' ? 'VIDEO' : mediaType;

      logger.info('ai', `🎨 Generating UGC media for ${platformConfig.platform}: ${mediaCount}x ${effectiveMediaType}`);

      // Generate Ad Copy specific to platform (needed for text overlays)
      const adCopy = await aiService.generateAdCopy({
        offerName: campaign.offer.name,
        copyMaster: aiContentResult.copyMaster,
        platform: platformConfig.platform as 'META' | 'TIKTOK',
        adFormat: effectiveMediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        country: campaign.country,
        language: campaign.language,
      });

      try {
        // ============================================
        // NEURAL ENGINE INTEGRATION (continueCampaign)
        // ============================================
        let ugcMedia: { images: any[]; videos: any[] } = { images: [], videos: [] };
        let usedNeuralEngine = false;

        // Try Neural Engine first if enabled and generating images for META
        if (isNeuralEngineEnabled() && platformConfig.platform === 'META' && effectiveMediaType !== 'VIDEO') {
          logger.info('ai', '🧠 Neural Engine ENABLED - Using 5-agent pipeline for image generation');

          const neuralResult = await generateWithNeuralEngine({
            offerId: campaign.offer.id.toString(),
            offerName: campaign.offer.name,
            offerVertical: campaign.offer.vertical,
            offerDescription: campaign.offer.description || undefined,
            copyMaster: aiContentResult.copyMaster, // Critical: pass manager's copy for image context
            country: campaign.country,
            language: campaign.language,
            platform: platformConfig.platform as 'META' | 'TIKTOK',
          });

          if (neuralResult && neuralResult.images.length > 0) {
            logger.success('ai', `🧠 Neural Engine generated ${neuralResult.images.length} images`);
            usedNeuralEngine = true;
            ugcMedia = {
              images: neuralResult.images.map((img) => ({
                url: img.url,
                gcsPath: img.gcsPath,
                prompt: 'Neural Engine 5-agent pipeline',
              })),
              videos: [],
            };

            // Update copyMaster with Neural Engine's version if available
            if (neuralResult.copyMaster) {
              aiContentResult.copyMaster = neuralResult.copyMaster;
            }
          } else {
            logger.warn('ai', '🧠 Neural Engine failed or no images - falling back to traditional AI');
          }
        }

        // Fallback to traditional AI service if Neural Engine not used
        if (!usedNeuralEngine) {
          if (isNeuralEngineEnabled()) {
            logger.info('ai', '📷 Using traditional AI service (Neural Engine fallback or VIDEO mode)');
          }

          // Generate UGC-style media with custom prompts and vertical classification
          ugcMedia = await aiService.generateUGCMedia({
            campaignId: campaign.id,
            platform: platformConfig.platform as 'META' | 'TIKTOK',
            mediaType: effectiveMediaType as 'IMAGE' | 'VIDEO' | 'BOTH',
            count: mediaCount,
            category: campaign.offer.vertical || campaign.offer.name,
            country: campaign.country,
            language: campaign.language,
            adTitle: adCopy.headline,
            copyMaster: aiContentResult.copyMaster,
            offerName: campaign.offer.name,
            vertical: campaign.offer.vertical,
          });
        }

        // Save generated images to database
        for (const image of ugcMedia.images) {
          await prisma.media.create({
            data: {
              campaignId: campaign.id,
              type: MediaType.IMAGE,
              generatedByAI: true,
              aiModel: 'imagen-4.0-fast-generate-001',
              aiPrompt: image.prompt,
              url: image.url,
              gcsPath: image.gcsPath,
              fileName: image.gcsPath.split('/').pop() || 'image.png',
              mimeType: 'image/png',
              usedInMeta: platformConfig.platform === 'META',
              usedInTiktok: false,
            },
          });
        }

        // Save generated videos to database (with thumbnails for Meta)
        for (const video of ugcMedia.videos) {
          const videoMedia = await prisma.media.create({
            data: {
              campaignId: campaign.id,
              type: MediaType.VIDEO,
              generatedByAI: true,
              aiModel: 'veo-3.1-fast',
              aiPrompt: video.prompt,
              url: video.url,
              gcsPath: video.gcsPath,
              fileName: video.gcsPath.split('/').pop() || 'video.mp4',
              mimeType: 'video/mp4',
              duration: 5,
              usedInMeta: platformConfig.platform === 'META',
              usedInTiktok: platformConfig.platform === 'TIKTOK',
            },
          });

          // If Meta and has thumbnail, create thumbnail and link it
          if (platformConfig.platform === 'META' && video.thumbnailUrl && video.thumbnailGcsPath) {
            const thumbnailMedia = await prisma.media.create({
              data: {
                campaignId: campaign.id,
                type: MediaType.IMAGE,
                generatedByAI: true,
                aiModel: 'imagen-4.0-fast-generate-001',
                aiPrompt: `Thumbnail for video: ${video.prompt}`,
                url: video.thumbnailUrl,
                gcsPath: video.thumbnailGcsPath,
                fileName: video.thumbnailGcsPath.split('/').pop() || 'thumbnail.png',
                mimeType: 'image/png',
                usedInMeta: true,
              },
            });

            await prisma.media.update({
              where: { id: videoMedia.id },
              data: { thumbnailMediaId: thumbnailMedia.id },
            });

            logger.success('ai', `Linked thumbnail ${thumbnailMedia.id} to video ${videoMedia.id}`);
          }
        }

        logger.success('ai', `✅ UGC media generated for ${platformConfig.platform}: ${ugcMedia.images.length} images, ${ugcMedia.videos.length} videos`);
      } catch (mediaError: any) {
        logger.error('ai', `❌ Failed to generate AI media for ${platformConfig.platform}: ${mediaError.message}`);
        errors.push(`AI media generation failed for ${platformConfig.platform}: ${mediaError.message}`);
        // Continue with campaign - user will need to upload media manually
      }
    }

    // ============================================
    // STEP 4: Configure Pixels
    // ============================================
    // Meta Pixel ID → Access Token mapping (each pixel has its own specific token)
    const META_PIXEL_TOKEN_MAPPING_CONTINUE: { [pixelId: string]: string } = {
      '1203351311131422': 'EAAJRmTwhsNgBO1OnDiD8eS4vZB2m1JGFUZAi9ErzWUBlV0hPtuoNZCL6TBADDy6jXAbd0lvc0RiZCOxrK991pcuW8b519EnhrpPKt4ZBTLLmUYMkkV4LZCYx1GAkU0uhBbekynZBdrpE30S9Th1x1zwpIUe0OACto0iKDZCFzfd6OBZCZBZBSRcPxZBMGrNZA4BOlqUrUAQZDZD', // L2 - Loans
      '1179895397093948': 'EABZB8DcFpOfsBOynXLGBDvWfGotmCDsrwHy2eaM3h5dbpVkHzg3vUMKmT481gRJlNa7bVRm1yE7ZA3M049Se5wrE0YSvPRDGQeaewl07KIK7uU1yjOolDjoJSZBn2Pno7VMZB2fmPhQH7rux8iITnSVp49Vhf8tYZBWgWqgEFzdWVizYHgBoZChHTi76u68jEVYgZDZD', // A1
      '1435976930918931': 'EABZB8DcFpOfsBO8Vkz5gBxmH9wIkH7CcPxgr9ZAbfF5lhslhfDZBRu7F9L5ZCIWS1H7jlFM3Mef7cRaZBg0IuR2aNo9BOA3HvWECyXHuDV2gEnVRS1aCzQmGV4LFvF6aOyjnyMcJFZBMZAq9iKCj6fmcmdqD25CIkwfvI1Kud269QIxZA0vreVbqUmIUA0XZAxMsmbQZDZD', // B1 - Rsoc Tonic
      '1891445634963589': 'EABZB8DcFpOfsBO6vHZBiXZBgo2LtZCjEpt0qOyQGvxxIN0LgOXp6vxU9VTUQmwkzMnevZAv5LnE2UKFNxhITNZAJb5Crt3tUcNZBREinKrlU4cf29T6hIqxPAZCfKbjbQLRoWO5zkZAZC3Axshd8jstZBnDCwFLjZAd9oWQ9bwCHReODOWltyJVZAudg2PkyDSOS6PXwknwZDZD', // Inforproductos
      '764050146176958': 'EAADuOFCzsHsBPPOGO8j4fzZBKy4BRViYTWiPiCZChKNAQ3sWVhWlTvTp267FXnLEzHgwEEMbWxoUz9fbQKBWaWP2iOSGbM00o3091hARmTf0QTlgPYbpt9a52cqNIxXMEBNx02YL2xzq0sSdepJzPTQ3IQ4a9OU0KEoGZBZAv7ul23HtpwoS5xaWSWCt4kmtGwZDZD', // B3
      '1039541308325786': 'EAAYl7gsCHoQBO1rJjzTkPmehaQaXd4yuSlcFQqo9wicerpGnmxwbGQNfQr0AKdwiBq5suGUxRsPLBAcLEY2NeJ5VQEvZANpLmdx2KWiOrE6ujdJqQGNbspu2O3OtJoruFE44qN77Nu8fR5NWC9maP5OSWbyXJznieeSddXgj6VjLjwmtvML4eBdoKyngjBAZDZD', // Y - Rsoc Tonic
      '878273167774607': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // H - RSOC Tonic
      '2718831948325465': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // Z
      '2180869225678766': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // S
      '847010030396510': 'EAAYl7gsCHoQBOyLePTu9YGoP5oxZCIVW25xphvSsHplE5NGJ5iCen8k2EUdh4W8PQChdH8hrfcEWZCWwrmGtBlblmkIKzbmgvOfIRTJUJtkv41bmjhDxnEKc5sOBCKzPFnzLw2c5AiqFvZAaYuZCQXgoxqWnhJeZBxyIfGATnBaNl31cTnM1RZBQW9iDbzFWjkZCwZDZD', // X - RSOC Tonic
      '860387142264159': 'EAAYl7gsCHoQBO5uHb4HvFXM0S3czUMZCTyPomIKw5iTDZBzfD8EODwZB20l2zMqGW3QrHMwdxR6WnyT7Pq85RTOVLhloqgkyUIJpTCIMQQso25LZA7DOWAhI2IkoHu0KJOJcfNq5JDtqA3oX6k3kjRBOyvywThOwSPRbiGnKzSdU7ZCm532mald7X3v0zpiEjBQZDZD', // Q
    };

    // TikTok pixel constants
    const TIKTOK_PIXEL_ID_CONTINUE = 'CQHUEGBC77U4RGRFJN4G';
    const TIKTOK_ACCESS_TOKEN_CONTINUE = '50679817ad0f0f06d1dadd43dbce8f3345b676cd';

    for (const platform of campaign.platforms) {
      if (platform.platform === 'META' && platform.metaAccount?.metaPixelId) {
        try {
          const pixelId = platform.metaAccount.metaPixelId.toString().trim();
          const pixelAccessToken = META_PIXEL_TOKEN_MAPPING_CONTINUE[pixelId] || platform.metaAccount.metaAccessToken || process.env.META_ACCESS_TOKEN || '';

          logger.info('tonic', `🔍 [continueCampaignAfterArticle] Pixel ID: "${pixelId}"`);
          logger.info('tonic', `🔍 [continueCampaignAfterArticle] Token found in mapping: ${META_PIXEL_TOKEN_MAPPING_CONTINUE[pixelId] ? 'YES' : 'NO'}`);
          logger.info('tonic', `🔍 [continueCampaignAfterArticle] Token preview: ${pixelAccessToken.substring(0, 20)}...`);

          await tonicService.createPixel(credentials, 'facebook', {
            campaign_id: parseInt(tonicCampaignId.toString()),
            pixel_id: pixelId,
            access_token: pixelAccessToken,
            event_name: 'Purchase',
            revenue_type: 'preestimated_revenue',
          });
          logger.success('tonic', `✅ Meta pixel ${pixelId} configured with correct token`);
        } catch (e: any) {
          logger.warn('tonic', `Failed to configure Meta pixel: ${e.message}`);
        }
      }

      if (platform.platform === 'TIKTOK') {
        try {
          // Use hardcoded TikTok pixel for Tonic (same for all accounts)
          await tonicService.createPixel(credentials, 'tiktok', {
            campaign_id: parseInt(tonicCampaignId.toString()),
            pixel_id: TIKTOK_PIXEL_ID_CONTINUE,
            access_token: TIKTOK_ACCESS_TOKEN_CONTINUE,
            event_name: 'Purchase',
            revenue_type: 'preestimated_revenue',
          });
          logger.success('tonic', 'TikTok pixel configured');
        } catch (e: any) {
          logger.warn('tonic', `Failed to configure TikTok pixel: ${e.message}`);
        }
      }
    }

    // ============================================
    // STEP 5: Launch to Platforms (reuse existing method)
    // ============================================
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.READY_TO_LAUNCH },
    });

    // Use existing launch method
    const launchResult = await this.launchExistingCampaignToPlatforms(campaignId);

    return launchResult;
  }
}

// Export singleton instance
export const campaignOrchestrator = new CampaignOrchestratorService();
export default campaignOrchestrator;
