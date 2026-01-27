/**
 * ============================================================================
 * Platform Launchers - Index
 * ============================================================================
 *
 * Exporta todos los launchers de plataformas disponibles.
 *
 * @module services/launchers
 */

// Types
export type {
  CampaignWithRelations,
  PlatformConfig,
  AIGeneratedContent,
  AdCopyContent,
  LaunchResult,
  RollbackResult,
  IPlatformLauncher,
  MetaAccountInfo,
  TikTokAccountInfo,
  MediaUploadResult,
  TargetingConfig,
} from './types';

export { LAUNCHER_CONSTANTS } from './types';

// Launchers
export { metaLauncher } from './meta-launcher.service';
export { tiktokLauncher } from './tiktok-launcher.service';

// Utility function to get launcher by platform
import { metaLauncher } from './meta-launcher.service';
import { tiktokLauncher } from './tiktok-launcher.service';
import type { IPlatformLauncher } from './types';

export function getLauncher(platform: 'META' | 'TIKTOK' | 'TABOOLA'): IPlatformLauncher {
  switch (platform) {
    case 'META':
      return metaLauncher;
    case 'TIKTOK':
      return tiktokLauncher;
    case 'TABOOLA':
      throw new Error('Taboola launcher not yet implemented');
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
