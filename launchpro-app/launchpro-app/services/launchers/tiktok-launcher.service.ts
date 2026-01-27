/**
 * ============================================================================
 * TikTok Launcher Service - TikTok Ads Platform
 * ============================================================================
 *
 * Servicio especializado para lanzar campañas a TikTok Ads.
 * Extraído del orquestador monolítico para mejor mantenibilidad.
 *
 * Responsabilidades:
 * - Crear campaña en TikTok Ads API
 * - Crear AdGroup con targeting
 * - Subir videos
 * - Crear Ads
 * - Rollback en caso de error
 *
 * IMPORTANTE: TikTok PLACEMENT_TIKTOK (in-feed) SOLO soporta VIDEO, NO imágenes.
 *
 * @module services/launchers/tiktok-launcher.service
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import { tiktokService } from '../tiktok.service';
import { aiService } from '../ai.service';
import { campaignAudit } from '../campaign-audit.service';
import { videoConverterService } from '../video-converter.service';
import { MediaType } from '@prisma/client';
import {
  resolveCountryCodesForTikTok,
  isWorldwide,
} from '@/lib/allowed-countries';

import type {
  IPlatformLauncher,
  LaunchResult,
  RollbackResult,
  CampaignWithRelations,
  PlatformConfig,
  AIGeneratedContent,
  TikTokAccountInfo,
} from './types';

// ============================================================================
// TikTok Launcher Implementation
// ============================================================================

class TikTokLauncherService implements IPlatformLauncher {
  readonly platform = 'TIKTOK' as const;

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
      adGroupIds: string[];
      adIds: string[];
    } = {
      adGroupIds: [],
      adIds: [],
    };

    try {
      // 1. Obtener información de cuenta
      const accountInfo = await this.getAccountInfo(platformConfig.accountId);

      // 2. Preparar nombre de campaña
      const fullCampaignName = campaign.tonicCampaignId
        ? `${campaign.tonicCampaignId}_${campaign.name}`
        : campaign.name;

      logger.info('tiktok-launcher', `Launching campaign: ${fullCampaignName}`, {
        campaignId: campaign.id,
        advertiserId: accountInfo.advertiserId,
      });

      // 3. Obtener videos de la campaña (TikTok solo soporta video)
      let videos = await this.getVideosForCampaign(campaign.id);
      
      // AUTO-FIX: Si no hay videos, intentar convertir imágenes
      if (videos.length === 0) {
        logger.info('tiktok-launcher', 'No videos found. Checking for images to convert...');
        
        const images = await prisma.media.findMany({
          where: {
            campaignId: campaign.id,
            type: MediaType.IMAGE,
          },
          orderBy: { createdAt: 'desc' },
          take: 1, // Convertimos solo la imagen más reciente para empezar
        });

        if (images.length > 0) {
          const imageToConvert = images[0];
          logger.info('tiktok-launcher', `Converting image to video: ${imageToConvert.fileName}`);
          
          campaignLogger.info(
            campaign.id,
            'video_conversion',
            `Auto-converting image to video for TikTok: ${imageToConvert.fileName}`
          );

          try {
            const convertedVideo = await videoConverterService.convertImageToVideo(
              imageToConvert.url,
              imageToConvert.fileName
            );

            // Guardar el nuevo video en la DB
            const newVideo = await prisma.media.create({
              data: {
                campaignId: campaign.id,
                type: MediaType.VIDEO,
                url: convertedVideo.gcsUrl || '', // URL pública o firmada
                fileName: convertedVideo.fileName,
                mimeType: 'video/mp4',
                size: 0, // Tamaño aproximado o desconocido
                width: convertedVideo.width,
                height: convertedVideo.height,
              },
            });

            // Limpiar archivo local temporal
            videoConverterService.cleanupConvertedVideo(convertedVideo.localPath);

            // Actualizar la lista de videos
            videos = [newVideo];
            
            campaignLogger.success(
              campaign.id,
              'video_conversion',
              `Video created successfully: ${newVideo.fileName}`
            );

          } catch (conversionError: any) {
            logger.error('tiktok-launcher', `Video conversion failed`, conversionError);
            throw new Error(
              `TikTok requires video. Auto-conversion failed: ${conversionError.message}`
            );
          }
        }
      }

      if (videos.length === 0) {
        throw new Error(
          'TikTok requires VIDEO for in-feed ads. No videos found and no images available for auto-conversion.'
        );
      }

      // 4. Validar Pixel (requerido para conversiones)
      const pixelId = accountInfo.pixelId;
      if (!pixelId) {
        throw new Error(
          'TikTok Pixel ID is required for conversion campaigns (Sales). ' +
          'Please configure a Pixel in the account settings or platform configuration.'
        );
      }

      // 5. Generar ad copy
      const adCopy = await this.generateAdCopy(campaign, aiContent);

      // 6. Crear campaña TikTok
      const budgetInDollars = Math.round(platformConfig.budget);

      const tiktokCampaign = await tiktokService.createCampaign({
        advertiser_id: accountInfo.advertiserId,
        campaign_name: fullCampaignName,
        objective_type: 'WEB_CONVERSIONS',
        budget_mode: 'BUDGET_MODE_DAY',
        budget: budgetInDollars,
        operation_status: 'ENABLE',
      }, accountInfo.accessToken);

      createdIds.campaignId = tiktokCampaign.campaign_id;

      campaignLogger.completeStep(
        campaign.id,
        'tiktok_campaign',
        `TikTok campaign created: ${tiktokCampaign.campaign_id}`
      );

      // 7. Generar targeting
      const targeting = await this.generateTargeting(
        campaign,
        aiContent,
        accountInfo
      );

      // 8. Crear AdGroup
      const startDate = this.calculateStartDate(platformConfig.startDate);

      const adGroup = await tiktokService.createAdGroup({
        advertiser_id: accountInfo.advertiserId,
        campaign_id: tiktokCampaign.campaign_id,
        adgroup_name: `${campaign.name}_AdGroup`,
        promotion_type: 'WEBSITE',
        placement_type: 'PLACEMENT_TYPE_AUTOMATIC',
        placements: ['PLACEMENT_TIKTOK'],
        budget_mode: 'BUDGET_MODE_DAY',
        budget: budgetInDollars,
        schedule_type: 'SCHEDULE_FROM_NOW',
        schedule_start_time: startDate.toISOString().replace('Z', ''),
        optimization_goal: 'CONVERSION',
        bid_type: 'BID_TYPE_NO_BID',
        billing_event: 'OCPM',
        pixel_id: pixelId,
        optimization_event: 'COMPLETE_PAYMENT',
        age_groups: targeting.ageGroups,
        location_ids: targeting.locationIds,
        gender: 'GENDER_UNLIMITED',
        operation_status: 'ENABLE',
      }, accountInfo.accessToken);

      createdIds.adGroupIds.push(adGroup.adgroup_id);

      // 9. Get identity info from platformConfig (set in wizard)
      const identityId = platformConfig.tiktokIdentityId || accountInfo.identityId;
      const identityType = (platformConfig.tiktokIdentityType || 'CUSTOMIZED_USER') as 'CUSTOMIZED_USER' | 'AUTH_USER' | 'BC_AUTH_TT';

      // 10. Crear Ads (uno por cada video)
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];

        // Subir video a TikTok
        const uploadResult = await tiktokService.uploadVideo({
          advertiser_id: accountInfo.advertiserId,
          video_url: video.url,
          upload_type: 'UPLOAD_BY_URL',
          file_name: video.fileName,
        }, accountInfo.accessToken);

        if (!uploadResult.video_id) {
          throw new Error(`Failed to upload video: ${video.fileName}`);
        }

        // Crear Ad
        const adName = this.generateAdName(campaign.name, i + 1);

        const ad = await tiktokService.createAd({
          advertiser_id: accountInfo.advertiserId,
          adgroup_id: adGroup.adgroup_id,
          ad_name: adName,
          ad_format: 'SINGLE_VIDEO',
          ad_text: platformConfig.manualTiktokAdText || adCopy.headline,
          video_id: uploadResult.video_id,
          call_to_action: 'LEARN_MORE',
          landing_page_url: campaign.tonicTrackingLink || '',
          identity_type: identityType,
          identity_id: identityId,
          operation_status: 'ENABLE',
        }, accountInfo.accessToken);

        createdIds.adIds.push(ad.ad_id);

        logger.info('tiktok-launcher', `Ad created: ${ad.ad_id}`, {
          videoId: uploadResult.video_id,
          adName,
        });
      }

      // 11. Actualizar Campaign Platform con IDs
      await prisma.campaignPlatform.update({
        where: { id: platformConfig.id },
        data: {
          tiktokCampaignId: tiktokCampaign.campaign_id,
          tiktokAdGroupId: adGroup.adgroup_id,
          tiktokAdId: createdIds.adIds[0],
        },
      });

      const processingTime = Date.now() - startTime;

      logger.success('tiktok-launcher', `Campaign launched successfully`, {
        campaignId: campaign.id,
        tiktokCampaignId: tiktokCampaign.campaign_id,
        adsCreated: createdIds.adIds.length,
        processingTimeMs: processingTime,
      });

      return {
        success: true,
        platform: 'TIKTOK',
        campaignId: tiktokCampaign.campaign_id,
        adSetId: adGroup.adgroup_id,
        adId: createdIds.adIds[0],
        additionalIds: {
          adIds: createdIds.adIds.slice(1),
        },
        metadata: {
          adsCreated: createdIds.adIds.length,
          processingTimeMs: processingTime,
        },
      };

    } catch (error: any) {
      logger.error('tiktok-launcher', `Launch failed, initiating rollback`, {
        campaignId: campaign.id,
        error: error.message,
      });

      // Intentar rollback
      await this.rollback({
        campaignId: createdIds.campaignId,
        additionalIds: {
          adSetIds: createdIds.adGroupIds,
          adIds: createdIds.adIds,
        },
      });

      return {
        success: false,
        platform: 'TIKTOK',
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
      ads: [],
    };
    const errors: string[] = [];

    // TikTok no tiene un API de eliminación directa como Meta
    // La mejor opción es desactivar/pausar las entidades

    try {
      // 1. Desactivar Ads
      const allAdIds = [ids.adId, ...(ids.additionalIds?.adIds || [])].filter(Boolean) as string[];
      for (const adId of allAdIds) {
        try {
          await tiktokService.updateAdStatus(adId, 'DISABLE');
          deletedEntities.ads!.push(adId);
        } catch (e: any) {
          errors.push(`Failed to disable ad ${adId}: ${e.message}`);
        }
      }

      // 2. Desactivar AdGroups
      const allAdGroupIds = [ids.adSetId, ...(ids.additionalIds?.adSetIds || [])].filter(Boolean) as string[];
      for (const adGroupId of allAdGroupIds) {
        try {
          await tiktokService.updateAdGroupStatus(adGroupId, 'DISABLE');
          deletedEntities.adSets!.push(adGroupId);
        } catch (e: any) {
          errors.push(`Failed to disable adgroup ${adGroupId}: ${e.message}`);
        }
      }

      // 3. Desactivar Campaign
      if (ids.campaignId) {
        try {
          await tiktokService.updateCampaignStatus(ids.campaignId, 'DISABLE');
          deletedEntities.campaigns!.push(ids.campaignId);
        } catch (e: any) {
          errors.push(`Failed to disable campaign ${ids.campaignId}: ${e.message}`);
        }
      }

      logger.info('tiktok-launcher', `Rollback completed (entities disabled)`, {
        disabled: deletedEntities,
        errors,
      });

      return {
        success: errors.length === 0,
        deletedEntities,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error: any) {
      logger.error('tiktok-launcher', `Rollback failed`, {
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

    // Validar cuenta TikTok
    const account = await prisma.account.findUnique({
      where: { id: platformConfig.accountId },
    });

    if (!account) {
      errors.push(`Account not found: ${platformConfig.accountId}`);
    } else {
      if (!account.tiktokAdvertiserId) {
        errors.push('TikTok Advertiser ID not configured');
      }
      if (!account.tiktokAccessToken) {
        const globalSettings = await prisma.globalSettings.findUnique({
          where: { id: 'global-settings' },
        });
        if (!globalSettings?.tiktokAccessToken && !process.env.TIKTOK_ACCESS_TOKEN) {
          errors.push('TikTok Access Token not configured');
        }
      }
      if (!account.tiktokPixelId) {
        errors.push('TikTok Pixel ID not configured (required for conversion campaigns)');
      }
    }

    // Validar que haya videos (TikTok solo soporta video)
    const videoCount = await prisma.media.count({
      where: {
        campaignId: campaign.id,
        type: MediaType.VIDEO,
      },
    });
    if (videoCount === 0) {
      errors.push('No video found for campaign (TikTok requires video for in-feed ads)');
    }

    // Validar tracking link
    if (!campaign.tonicTrackingLink) {
      errors.push('Tracking link not available');
    }

    // Validar presupuesto mínimo (TikTok requiere mínimo $50/día)
    if (platformConfig.budget < 50) {
      errors.push('TikTok requires minimum $50 daily budget');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async getAccountInfo(accountId: string): Promise<TikTokAccountInfo> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.tiktokAdvertiserId) {
      throw new Error(`TikTok account not found or missing Advertiser ID: ${accountId}`);
    }

    let accessToken = account.tiktokAccessToken;

    if (!accessToken) {
      const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global-settings' },
      });
      accessToken = globalSettings?.tiktokAccessToken ?? process.env.TIKTOK_ACCESS_TOKEN ?? null;
    }

    if (!accessToken) {
      throw new Error(`No TikTok access token found for account: ${account.name}`);
    }

    return {
      advertiserId: account.tiktokAdvertiserId,
      accessToken,
      pixelId: account.tiktokPixelId || undefined,
    };
  }

  private async getVideosForCampaign(campaignId: string) {
    return await prisma.media.findMany({
      where: {
        campaignId,
        type: MediaType.VIDEO,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async generateAdCopy(
    campaign: CampaignWithRelations,
    aiContent: AIGeneratedContent
  ) {
    logger.info('tiktok-launcher', 'Generating ad copy with AI');

    await campaignAudit.log(campaign.id, {
      event: 'AI_CALL',
      source: 'tiktok-launcher.generateAdCopy',
      message: 'Generating TikTok ad copy with Gemini',
      details: { platform: 'TIKTOK' },
    });

    const adCopy = await aiService.generateAdCopy({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
      adFormat: 'VIDEO',
      country: campaign.country,
      language: campaign.language,
    });

    return adCopy;
  }

  private async generateTargeting(
    campaign: CampaignWithRelations,
    aiContent: AIGeneratedContent,
    accountInfo: TikTokAccountInfo
  ) {
    // Generar sugerencias de targeting
    const suggestions = await aiService.generateTargetingSuggestions({
      offerName: campaign.offer.name,
      copyMaster: aiContent.copyMaster,
      platform: 'TIKTOK',
    });

    // Age groups: Siempre usar todos excepto 13-17 para máximo alcance
    const ageGroups = [
      'AGE_18_24',
      'AGE_25_34',
      'AGE_35_44',
      'AGE_45_54',
      'AGE_55_100',
    ];

    // Location IDs
    let locationIds: string[];
    const targetCountries = resolveCountryCodesForTikTok(campaign.country);

    if (isWorldwide(campaign.country)) {
      logger.info('tiktok-launcher', `WORLDWIDE targeting - resolving ${targetCountries.length} countries`);
      locationIds = await tiktokService.getLocationIds(targetCountries);
    } else {
      if (targetCountries.length === 0) {
        throw new Error(`Country ${campaign.country} is not allowed for TikTok monetization`);
      }
      const locationId = await tiktokService.getLocationId(campaign.country);
      locationIds = [locationId];
    }

    return {
      ageGroups,
      locationIds,
    };
  }

  private calculateStartDate(startDate?: Date): Date {
    let date = startDate ? new Date(startDate) : new Date();
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    // TikTok requiere que el start time esté en el futuro
    if (date < tenMinutesFromNow) {
      date = new Date(now.getTime() + 15 * 60 * 1000);
    }

    return date;
  }

  private generateAdName(campaignName: string, index: number): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    return `${campaignName}_Ad${index}_${dateStr}`;
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const tiktokLauncher = new TikTokLauncherService();
