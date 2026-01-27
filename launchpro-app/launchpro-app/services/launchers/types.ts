/**
 * ============================================================================
 * Launcher Types - Shared types for platform launchers
 * ============================================================================
 *
 * Este archivo define las interfaces y tipos compartidos entre
 * los diferentes launchers de plataformas (Meta, TikTok, Taboola).
 *
 * @module services/launchers/types
 */

import { Campaign, CampaignPlatform, Account, Media, Offer } from '@prisma/client';

// ============================================================================
// Campaign Types (Extended with relations)
// ============================================================================

/**
 * CampaignPlatform extendido con relaciones de cuenta
 */
export interface CampaignPlatformWithAccounts extends CampaignPlatform {
  tonicAccount?: Account | null;
  metaAccount?: Account | null;
  tiktokAccount?: Account | null;
  taboolaAccount?: Account | null;
}

/**
 * Campaign con todas las relaciones necesarias para los launchers
 */
export interface CampaignWithRelations extends Campaign {
  platforms: CampaignPlatformWithAccounts[];
  media: Media[];
  offer: Offer;
}

export interface PlatformConfig {
  id: string;
  campaignId: string;
  platform: 'META' | 'TIKTOK' | 'TABOOLA';
  accountId: string;
  budget: number;
  performanceGoal?: string | null;
  startDate: Date;
  generateWithAI: boolean;
  aiMediaType?: 'IMAGE' | 'VIDEO' | 'BOTH' | null;
  aiMediaCount?: number | null;
  adsPerAdSet?: number | null;
  specialAdCategories?: string[];

  // Meta-specific
  metaPageId?: string | null;
  manualAdCopy?: {
    adTitle?: string;
    description?: string;
    primaryText?: string;
  } | null;

  // TikTok-specific
  tiktokIdentityId?: string | null;
  tiktokIdentityType?: string | null;
  manualTiktokAdText?: string | null;

  // Taboola-specific
  taboolaBidStrategy?: 'FIXED' | 'MAX_CONVERSIONS' | 'TARGET_CPA' | 'ENHANCED_CPC' | null;
  taboolaCpc?: number | null;
  taboolaBrandingText?: string | null;
}

// ============================================================================
// AI Content Types
// ============================================================================

export interface AIGeneratedContent {
  copyMaster: string;
  headlines: string[];
  primaryTexts: string[];
  descriptions: string[];
  keywords?: string[];
  images?: Array<{
    url: string;
    gcsPath?: string;
  }>;
  videos?: Array<{
    url: string;
    gcsPath?: string;
  }>;
}

export interface AdCopyContent {
  headline: string;
  primaryText: string;
  description: string;
  callToAction: string;
}

// ============================================================================
// Launch Result Types
// ============================================================================

/**
 * Resultado de lanzamiento a una plataforma
 */
export interface LaunchResult {
  success: boolean;
  platform: 'META' | 'TIKTOK' | 'TABOOLA';

  // IDs creados en la plataforma
  campaignId?: string;
  adSetId?: string;        // Meta: AdSet, TikTok: AdGroup
  creativeId?: string;     // Meta: AdCreative, TikTok: no aplica
  adId?: string;           // Meta: Ad, TikTok: Ad

  // IDs adicionales creados (para ABO con múltiples AdSets)
  additionalIds?: {
    adSetIds?: string[];
    creativeIds?: string[];
    adIds?: string[];
  };

  // Información del error (si falló)
  error?: string;
  errorCode?: string;
  errorDetails?: Record<string, unknown>;

  // Metadata
  metadata?: {
    budgetUsed?: number;
    mediaUploaded?: number;
    adsCreated?: number;
    processingTimeMs?: number;
  };
}

/**
 * Resultado de rollback
 */
export interface RollbackResult {
  success: boolean;
  deletedEntities: {
    campaigns?: string[];
    adSets?: string[];
    creatives?: string[];
    ads?: string[];
  };
  errors?: string[];
}

// ============================================================================
// Platform Account Types
// ============================================================================

export interface MetaAccountInfo {
  adAccountId: string;
  accessToken: string;
  pageId?: string;
  pixelId?: string;
}

export interface TikTokAccountInfo {
  advertiserId: string;
  accessToken: string;
  identityId?: string;
  identityType?: 'CUSTOMIZED_USER' | 'AUTH_USER' | 'BC_AUTH_TT';
  pixelId?: string;
}

// ============================================================================
// Upload Types
// ============================================================================

export interface MediaUploadResult {
  success: boolean;
  mediaId?: string;        // ID en la plataforma
  hash?: string;           // Meta: image_hash
  url?: string;            // URL pública
  error?: string;
}

// ============================================================================
// Targeting Types
// ============================================================================

export interface TargetingConfig {
  ageMin?: number;
  ageMax?: number;
  genders?: ('male' | 'female' | 'all')[];
  countries: string[];
  regions?: string[];
  cities?: string[];
  interests?: Array<{ id: string; name: string }>;
  behaviors?: Array<{ id: string; name: string }>;
  languages?: string[];
  deviceTypes?: ('mobile' | 'desktop')[];
  placements?: string[];
}

// ============================================================================
// Launcher Interface
// ============================================================================

/**
 * Interfaz que deben implementar todos los launchers
 */
export interface IPlatformLauncher {
  /**
   * Nombre de la plataforma
   */
  readonly platform: 'META' | 'TIKTOK' | 'TABOOLA';

  /**
   * Lanza una campaña a la plataforma
   */
  launch(
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig,
    aiContent: AIGeneratedContent
  ): Promise<LaunchResult>;

  /**
   * Hace rollback de entidades creadas (en caso de error)
   */
  rollback(ids: {
    campaignId?: string;
    adSetId?: string;
    creativeId?: string;
    adId?: string;
    additionalIds?: LaunchResult['additionalIds'];
  }): Promise<RollbackResult>;

  /**
   * Valida que se tienen todos los requisitos para lanzar
   */
  validatePrerequisites(
    campaign: CampaignWithRelations,
    platformConfig: PlatformConfig
  ): Promise<{ valid: boolean; errors: string[] }>;
}

// ============================================================================
// Constants
// ============================================================================

export const LAUNCHER_CONSTANTS = {
  META: {
    API_VERSION: 'v21.0',
    DEFAULT_CTA: 'LEARN_MORE',
    MAX_HEADLINE_LENGTH: 40,
    MAX_DESCRIPTION_LENGTH: 125,
    MAX_PRIMARY_TEXT_LENGTH: 125,
    SUPPORTED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'gif'],
    SUPPORTED_VIDEO_FORMATS: ['mp4', 'mov'],
    MAX_IMAGE_SIZE_MB: 30,
    MAX_VIDEO_SIZE_MB: 4096,
  },
  TIKTOK: {
    DEFAULT_CTA: 'LEARN_MORE',
    MAX_AD_TEXT_LENGTH: 100,
    SUPPORTED_VIDEO_FORMATS: ['mp4', 'mov', 'mpeg', 'avi'],
    MIN_VIDEO_DURATION_SEC: 5,
    MAX_VIDEO_DURATION_SEC: 60,
    RECOMMENDED_VIDEO_RATIO: '9:16',
  },
  TABOOLA: {
    DEFAULT_BID_STRATEGY: 'FIXED',
    MIN_CPC: 0.01,
    MAX_TITLE_LENGTH: 60,
  },
} as const;
