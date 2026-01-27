/**
 * ============================================================================
 * Meta Launcher Service - Facebook/Instagram Ads Platform
 * ============================================================================
 *
 * Servicio especializado para lanzar campañas a Meta Ads (Facebook/Instagram).
 * Extraído del orquestador monolítico para mejor mantenibilidad.
 *
 * Responsabilidades:
 * - Crear campaña en Meta Ads API
 * - Crear AdSet(s) con targeting
 * - Subir media (imágenes/videos)
 * - Crear AdCreative(s)
 * - Crear Ad(s)
 * - Rollback en caso de error
 *
 * @module services/launchers/meta-launcher.service
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import { metaService } from '../meta.service';
import { aiService } from '../ai.service';
import { campaignAudit } from '../campaign-audit.service';
import { MediaType } from '@prisma/client';
import {
  resolveCountryCodes,
  isWorldwide,
} from '@/lib/allowed-countries';

import type {
  IPlatformLauncher,
  LaunchResult,
  RollbackResult,
  CampaignWithRelations,
  PlatformConfig,
  AIGeneratedContent,
  AdCopyContent,
  MetaAccountInfo,
  LAUNCHER_CONSTANTS,
} from './types';

// ============================================================================
// Meta Launcher Implementation
// ============================================================================

class MetaLauncherService implements IPlatformLauncher {
  readonly platform = 'META' as const;

  // ============================================================================
  // Main Launch Method
  // ============================================================================

  async launch(
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    aiContent: AIGeneratedContent
  ): Promise<LaunchResult> {
    const startTime = Date.now();
    const createdIds: {
      campaignId?: string;
      adSetIds: string[];
      creativeIds: string[];
      adIds: string[];
    } = {
      adSetIds: [],
      creativeIds: [],
      adIds: [],
    };

    try {
      // 1. Obtener información de cuenta
      const accountInfo = await this.getAccountInfo(platformConfig.accountId);

      // 2. Preparar nombre de campaña
      const fullCampaignName = campaign.tonicCampaignId
        ? `${campaign.tonicCampaignId}_${campaign.name}`
        : campaign.name;

      logger.info('meta-launcher', `Launching campaign: ${fullCampaignName}`, {
        campaignId: campaign.id,
        adAccountId: accountInfo.adAccountId,
      });

      // 3. Obtener media de la campaña
      const { images, videos } = await this.getMediaForCampaign(campaign.id);
      if (images.length === 0 && videos.length === 0) {
        throw new Error('No media found for Meta campaign. Please upload at least one image or video.');
      }

      const useVideo = videos.length > 0;
      const adFormat: 'IMAGE' | 'VIDEO' = useVideo ? 'VIDEO' : 'IMAGE';

      // 4. Generar o usar ad copy
      const adCopy = await this.getAdCopy(
        campaign,
        platformConfig,
        aiContent,
        adFormat
      );

      // 5. Determinar configuración de presupuesto
      const isCBO = campaign.campaignType === 'CBO';
      const budgetInCents = Math.round(platformConfig.budget * 100);

      // 6. Crear campaña Meta
      const metaCampaign = await this.createMetaCampaign(
        fullCampaignName,
        campaign,
        platformConfig,
        accountInfo,
        isCBO,
        budgetInCents
      );
      createdIds.campaignId = metaCampaign.id;

      campaignLogger.completeStep(
        campaign.id,
        'meta_campaign',
        `Meta campaign created: ${metaCampaign.id}`
      );

      // 7. Generar targeting
      const targeting = await this.generateTargeting(
        campaign,
        aiContent,
        accountInfo
      );

      // 8. Crear AdSet(s)
      if (isCBO) {
        // CBO: Un solo AdSet
        const adSetResult = await this.createAdSet(
          metaCampaign.id,
          campaign,
          platformConfig,
          accountInfo,
          targeting,
          isCBO,
          budgetInCents
        );
        createdIds.adSetIds.push(adSetResult.id);

        // 9. Crear Creative(s) y Ad(s)
        await this.createAdsForAdSet(
          adSetResult.id,
          campaign,
          platformConfig,
          accountInfo,
          adCopy,
          images,
          videos,
          createdIds
        );

      } else {
        // ABO: Un AdSet por cada imagen/video
        const mediaItems = useVideo ? videos : images;
        const adsPerAdSet = platformConfig.adsPerAdSet || 1;

        for (let i = 0; i < mediaItems.length; i++) {
          const adSetName = `${campaign.name}_AdSet_${i + 1}`;
          const adSetResult = await this.createAdSet(
            metaCampaign.id,
            campaign,
            { ...platformConfig, name: adSetName } as any,
            accountInfo,
            targeting,
            isCBO,
            budgetInCents
          );
          createdIds.adSetIds.push(adSetResult.id);

          // Crear ads para este AdSet
          await this.createSingleAdForAdSet(
            adSetResult.id,
            campaign,
            accountInfo,
            adCopy,
            mediaItems[i],
            useVideo,
            createdIds
          );
        }
      }

      // 10. Actualizar Campaign Platform con IDs
      await prisma.campaignPlatform.update({
        where: { id: platformConfig.id },
        data: {
          metaCampaignId: metaCampaign.id,
          metaAdSetId: createdIds.adSetIds[0],
          metaAdId: createdIds.adIds[0],
        },
      });

      const processingTime = Date.now() - startTime;

      logger.success('meta-launcher', `Campaign launched successfully`, {
        campaignId: campaign.id,
        metaCampaignId: metaCampaign.id,
        adSetsCreated: createdIds.adSetIds.length,
        adsCreated: createdIds.adIds.length,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        platform: 'META',
        campaignId: metaCampaign.id,
        adSetId: createdIds.adSetIds[0],
        creativeId: createdIds.creativeIds[0],
        adId: createdIds.adIds[0],
        additionalIds: {
          adSetIds: createdIds.adSetIds.slice(1),
          creativeIds: createdIds.creativeIds.slice(1),
          adIds: createdIds.adIds.slice(1),
        },
        metadata: {
          adsCreated: createdIds.adIds.length,
          processingTimeMs: processingTime,
        },
      };

    } catch (error: any) {
      logger.error('meta-launcher', `Launch failed, initiating rollback`, {
        campaignId: campaign.id,
        error: error.message,
      });

      // Intentar rollback
      await this.rollback({
        campaignId: createdIds.campaignId,
        additionalIds: {
          adSetIds: createdIds.adSetIds,
          creativeIds: createdIds.creativeIds,
          adIds: createdIds.adIds,
        },
      });

      return {
        success: false,
        platform: 'META',
        error: error.message,
        errorDetails: {
          phase: 'launch',
          campaignId: campaign.id,
        },
      };
    }
  }

  // ============================================================================
  // Rollback Method
  // ============================================================================

  async rollback(ids: {
    campaignId?: string;
    adSetId?: string;
    creativeId?: string;
    adId?: string;
    additionalIds?: LaunchResult['additionalIds'];
  }): Promise<RollbackResult> {
    const deletedEntities: RollbackResult['deletedEntities'] = {
      campaigns: [],
      adSets: [],
      creatives: [],
      ads: [],
    };
    const errors: string[] = [];

    try {
      // Eliminar en orden inverso: Ads → Creatives → AdSets → Campaign

      // 1. Eliminar Ads
      const allAdIds = [ids.adId, ...(ids.additionalIds?.adIds || [])].filter(Boolean) as string[];
      for (const adId of allAdIds) {
        try {
          await metaService.deleteAd(adId);
          deletedEntities.ads!.push(adId);
        } catch (e: any) {
          errors.push(`Failed to delete ad ${adId}: ${e.message}`);
        }
      }

      // 2. Eliminar Creatives
      const allCreativeIds = [ids.creativeId, ...(ids.additionalIds?.creativeIds || [])].filter(Boolean) as string[];
      for (const creativeId of allCreativeIds) {
        try {
          // Meta Creatives no siempre se pueden eliminar directamente
          // Normalmente se eliminan automáticamente con el Ad
          deletedEntities.creatives!.push(creativeId);
        } catch (e: any) {
          errors.push(`Failed to delete creative ${creativeId}: ${e.message}`);
        }
      }

      // 3. Eliminar AdSets
      const allAdSetIds = [ids.adSetId, ...(ids.additionalIds?.adSetIds || [])].filter(Boolean) as string[];
      for (const adSetId of allAdSetIds) {
        try {
          await metaService.deleteAdSet(adSetId);
          deletedEntities.adSets!.push(adSetId);
        } catch (e: any) {
          errors.push(`Failed to delete adset ${adSetId}: ${e.message}`);
        }
      }

      // 4. Eliminar Campaign
      if (ids.campaignId) {
        try {
          await metaService.deleteCampaign(ids.campaignId);
          deletedEntities.campaigns!.push(ids.campaignId);
        } catch (e: any) {
          errors.push(`Failed to delete campaign ${ids.campaignId}: ${e.message}`);
        }
      }

      logger.info('meta-launcher', `Rollback completed`, {
        deleted: deletedEntities,
        errors,
      });

      return {
        success: errors.length === 0,
        deletedEntities,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error: any) {
      logger.error('meta-launcher', `Rollback failed`, {
        error: error.message,
        ids,
      });

      return {
        success: false,
        deletedEntities,
        errors: [...errors, `Rollback error: ${error.message}`],
      };
    }
  }

  // ============================================================================
  // Validation Method
  // ============================================================================

  async validatePrerequisites(
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validar cuenta Meta
    const account = await prisma.account.findUnique({
      where: { id: platformConfig.accountId },
    });

    if (!account) {
      errors.push(`Account not found: ${platformConfig.accountId}`);
    } else {
      if (!account.metaAdAccountId) {
        errors.push('Meta Ad Account ID not configured');
      }
      if (!account.metaAccessToken) {
        // Verificar global settings
        const globalSettings = await prisma.globalSettings.findUnique({
          where: { id: 'global-settings' },
        });
        if (!globalSettings?.metaAccessToken && !process.env.META_ACCESS_TOKEN) {
          errors.push('Meta Access Token not configured');
        }
      }
    }

    // Validar media
    const mediaCount = await prisma.media.count({
      where: { campaignId: campaign.id },
    });
    if (mediaCount === 0) {
      errors.push('No media found for campaign');
    }

    // Validar tracking link
    if (!campaign.tonicTrackingLink) {
      errors.push('Tracking link not available');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async getAccountInfo(accountId: string): Promise<MetaAccountInfo> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.metaAdAccountId) {
      throw new Error(`Meta account not found or missing Ad Account ID: ${accountId}`);
    }

    let accessToken = account.metaAccessToken;

    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });
      accessToken = globalSettings?.metaAccessToken ?? process.env.META_ACCESS_TOKEN ?? null;
    }

    if (!accessToken) {
      throw new Error(`No Meta access token found for account: ${account.name}`);
    }

    return {
      adAccountId: account.metaAdAccountId,
      accessToken,
      pageId: account.metaPageId || undefined,
      pixelId: account.metaPixelId || undefined,
    };
  }

  private async getMediaForCampaign(campaignId: string) {
    const allMedia = await prisma.media.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      images: allMedia.filter(m => m.type === MediaType.IMAGE),
      videos: allMedia.filter(m => m.type === MediaType.VIDEO),
    };
  }

  private async getAdCopy(
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    aiContent: AIGeneratedContent,
    adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL'
  ): Promise<AdCopyContent> {
    const hasManualAdCopy = platformConfig.manualAdCopy &&
      (platformConfig.manualAdCopy.adTitle ||
        platformConfig.manualAdCopy.description ||
        platformConfig.manualAdCopy.primaryText);

    if (hasManualAdCopy) {
      logger.info('meta-launcher', 'Using manual ad copy');
      return {
        headline: platformConfig.manualAdCopy!.adTitle || '',
        primaryText: platformConfig.manualAdCopy!.primaryText || '',
        description: platformConfig.manualAdCopy!.description || '',
        callToAction: 'LEARN_MORE',
      };
    }

    // Generate with AI
    logger.info('meta-launcher', 'Generating ad copy with AI');
    await campaignAudit.log(campaign.id, {
      event: 'AI_CALL',
      source: 'meta-launcher.getAdCopy',
      message: 'Generating ad copy with Gemini',
      details: { platform: 'META', adFormat },
    });

    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'META',
      adFormat,
      country: campaign.country,
      language: campaign.language,
    });

    return adCopy;
  }

  private async createMetaCampaign(
    name: string,
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    accountInfo: MetaAccountInfo,
    isCBO: boolean,
    budgetInCents: number
  ) {
    const restrictedCategories = ['CREDIT', 'HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES'];
    const hasRestrictedCategory = platformConfig.specialAdCategories?.some(
      cat => restrictedCategories.includes(cat)
    );

    const transformSpecialAdCategory = (cat: string): string => {
      if (cat === 'CREDIT') return 'FINANCIAL_PRODUCTS_SERVICES';
      return cat;
    };

    const effectiveSpecialAdCategories = platformConfig.specialAdCategories?.length
      ? platformConfig.specialAdCategories.map(transformSpecialAdCategory)
      : ['NONE'];

    return await metaService.createCampaign({
      name,
      objective: 'OUTCOME_SALES',
      status: 'ACTIVE',
      special_ad_categories: effectiveSpecialAdCategories,
      special_ad_category_country: hasRestrictedCategory
        ? resolveCountryCodes(campaign.country)
        : undefined,
      daily_budget: isCBO ? budgetInCents : undefined,
      bid_strategy: isCBO ? 'LOWEST_COST_WITHOUT_CAP' : undefined,
    }, accountInfo.adAccountId, accountInfo.accessToken);
  }

  private async generateTargeting(
    campaign: CampaignWithRelations,
    aiContent: AIGeneratedContent,
    accountInfo: MetaAccountInfo
  ) {
    // Generar sugerencias de targeting con AI
    const suggestions = await aiService.generateTargetingSuggestions({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'META',
    });

    // Procesar intereses (buscar IDs)
    const interests: Array<{ id: string; name: string }> = [];
    if (suggestions.interests) {
      for (const interest of suggestions.interests) {
        try {
          const searchResults = await metaService.searchInterests(
            interest,
            accountInfo.accessToken
          );
          if (searchResults?.data?.length > 0) {
            interests.push({
              id: searchResults.data[0].id,
              name: searchResults.data[0].name,
            });
          }
        } catch (e) {
          logger.warn('meta-launcher', `Interest not found: ${interest}`);
        }
      }
    }

    // Construir targeting
    const countryCodes = resolveCountryCodes(campaign.country);

    // Parse age groups from AI suggestions (e.g., "25-45" -> min: 25, max: 45)
    let ageMin = 18;
    let ageMax = 65;
    if (suggestions.ageGroups && suggestions.ageGroups.length > 0) {
      const ageRanges = suggestions.ageGroups
        .map((ag: string) => {
          const match = ag.match(/(\d+)\s*[-–]\s*(\d+)/);
          return match ? { min: parseInt(match[1]), max: parseInt(match[2]) } : null;
        })
        .filter(Boolean);

      if (ageRanges.length > 0) {
        ageMin = Math.min(...ageRanges.map((r: any) => r.min));
        ageMax = Math.max(...ageRanges.map((r: any) => r.max));
      }
    }

    return {
      geo_locations: {
        countries: countryCodes,
      },
      age_min: ageMin,
      age_max: ageMax,
      ...(interests.length > 0 && { interests }),
      publisher_platforms: ['facebook', 'instagram', 'messenger'],
    };
  }

  private async createAdSet(
    metaCampaignId: string,
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    accountInfo: MetaAccountInfo,
    targeting: any,
    isCBO: boolean,
    budgetInCents: number
  ) {
    const pixelId = accountInfo.pixelId || process.env.META_PIXEL_ID || '';

    const startDate = platformConfig.startDate || new Date();
    startDate.setHours(startDate.getHours() + 24);

    return await metaService.createAdSet({
      campaign_id: metaCampaignId,
      name: `${campaign.name}_AdSet`,
      optimization_goal: 'OFFSITE_CONVERSIONS',
      billing_event: 'IMPRESSIONS',
      status: 'ACTIVE',
      targeting,
      start_time: startDate.toISOString(),
      promoted_object: pixelId ? {
        pixel_id: pixelId,
        custom_event_type: 'PURCHASE',
      } : undefined,
      // ABO: presupuesto a nivel de AdSet
      daily_budget: !isCBO ? budgetInCents : undefined,
      bid_strategy: !isCBO ? 'LOWEST_COST_WITHOUT_CAP' : undefined,
    }, accountInfo.adAccountId, accountInfo.accessToken);
  }

  private async createAdsForAdSet(
    adSetId: string,
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    accountInfo: MetaAccountInfo,
    adCopy: AdCopyContent,
    images: any[],
    videos: any[],
    createdIds: { creativeIds: string[]; adIds: string[] }
  ) {
    const useVideo = videos.length > 0;
    const mediaItems = useVideo ? videos : images;

    for (let i = 0; i < mediaItems.length; i++) {
      await this.createSingleAdForAdSet(
        adSetId,
        campaign,
        accountInfo,
        adCopy,
        mediaItems[i],
        useVideo,
        createdIds
      );
    }
  }

  private async createSingleAdForAdSet(
    adSetId: string,
    campaign: CampaignWithRelations,
    accountInfo: MetaAccountInfo,
    adCopy: AdCopyContent,
    media: any,
    isVideo: boolean,
    createdIds: { creativeIds: string[]; adIds: string[] }
  ) {
    const pageId = accountInfo.pageId || process.env.META_PAGE_ID || '';
    const trackingLink = campaign.tonicTrackingLink || '';

    let creative;

    if (isVideo) {
      // Subir video y crear creative
      // uploadVideo devuelve directamente el video_id (string)
      const videoId = await metaService.uploadVideo(
        media.url,
        media.fileName,
        accountInfo.adAccountId,
        accountInfo.accessToken
      );

      creative = await metaService.createAdCreative({
        name: `${campaign.name}_Creative_Video`,
        object_story_spec: {
          page_id: pageId,
          video_data: {
            video_id: videoId,
            message: adCopy.primaryText,
            title: adCopy.headline,
            call_to_action: {
              type: adCopy.callToAction,
              value: { link: trackingLink },
            },
          },
        },
      }, accountInfo.adAccountId, accountInfo.accessToken);

    } else {
      // Subir imagen y crear creative
      // uploadImage devuelve directamente el image_hash (string)
      const imageHash = await metaService.uploadImage(
        media.url,
        media.fileName,
        accountInfo.adAccountId,
        accountInfo.accessToken
      );

      creative = await metaService.createAdCreative({
        name: `${campaign.name}_Creative_Image`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            link: trackingLink,
            message: adCopy.primaryText,
            name: adCopy.headline,
            description: adCopy.description,
            image_hash: imageHash,
            call_to_action: {
              type: adCopy.callToAction,
              value: { link: trackingLink },
            },
          },
        },
      }, accountInfo.adAccountId, accountInfo.accessToken);
    }

    createdIds.creativeIds.push(creative.id);

    // Crear Ad
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const adName = `${campaign.name}_${tomorrow.toISOString().split('T')[0]}`;

    const ad = await metaService.createAd({
      name: adName,
      adset_id: adSetId,
      creative: { creative_id: creative.id },
      status: 'ACTIVE',
    }, accountInfo.adAccountId, accountInfo.accessToken);

    createdIds.adIds.push(ad.id);

    logger.info('meta-launcher', `Ad created: ${ad.id}`);
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const metaLauncher = new MetaLauncherService();
