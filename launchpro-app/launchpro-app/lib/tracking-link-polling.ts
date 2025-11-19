import { tonicService } from '@/services/tonic.service';
import { logger } from '@/lib/logger';
import { TonicCredentials } from '@/services/tonic.service';

/**
 * Tracking Link Polling Utility
 *
 * Waits for Tonic to generate a tracking link for a campaign.
 * The tracking link is essential for Meta/TikTok ads to redirect users correctly.
 *
 * According to Tonic API behavior:
 * - Campaign status starts as "pending"
 * - After processing (5-10 minutes), status becomes "active"
 * - Only when "active", the tracking link is available in response[0].link
 */

export interface TrackingLinkPollingOptions {
  maxWaitMinutes?: number; // Maximum time to wait (default: 15 minutes)
  pollingIntervalSeconds?: number; // How often to check (default: 30 seconds)
  onProgress?: (status: string, elapsedSeconds: number) => void; // Callback for progress updates
}

export interface TrackingLinkPollingResult {
  success: boolean;
  trackingLink?: string;
  campaignStatus?: string;
  error?: string;
  elapsedSeconds: number;
  attemptsCount: number;
}

/**
 * Wait for Tonic to generate a tracking link for a campaign
 *
 * @param credentials - Tonic API credentials
 * @param campaignId - The Tonic campaign ID
 * @param options - Polling options
 * @returns TrackingLinkPollingResult with tracking link if available
 */
export async function waitForTrackingLink(
  credentials: TonicCredentials,
  campaignId: string,
  options: TrackingLinkPollingOptions = {}
): Promise<TrackingLinkPollingResult> {
  const {
    maxWaitMinutes = 15,
    pollingIntervalSeconds = 30,
    onProgress,
  } = options;

  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const pollingIntervalMs = pollingIntervalSeconds * 1000;
  const startTime = Date.now();
  let attemptsCount = 0;

  logger.info('tonic', `⏳ Starting to wait for tracking link...`, {
    campaignId,
    maxWaitMinutes,
    pollingIntervalSeconds,
  });

  while (true) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    attemptsCount++;

    // Check timeout
    if (elapsedMs >= maxWaitMs) {
      const errorMsg = `⏰ Timeout: Tracking link not available after ${maxWaitMinutes} minutes`;
      logger.warn('tonic', errorMsg, {
        campaignId,
        elapsedSeconds,
        attemptsCount,
      });

      return {
        success: false,
        error: errorMsg,
        elapsedSeconds,
        attemptsCount,
      };
    }

    try {
      // Fetch campaign status
      logger.info('tonic', `🔍 Checking tracking link (attempt ${attemptsCount})...`, {
        campaignId,
        elapsedSeconds,
      });

      const campaignStatus = await tonicService.getCampaignStatus(credentials, campaignId);

      // Extract status and link from response
      // Response format: { "0": { "link": "xxx.track.com", "ssl": true }, "status": "active" }
      // Or when pending: { "status": "pending" }
      const status = campaignStatus?.status || 'unknown';
      const linkData = campaignStatus?.['0'] || campaignStatus?.[0];
      const trackingLink = linkData?.link || linkData?.tracking_link;

      logger.info('tonic', `📡 Campaign status: ${status}`, {
        campaignId,
        status,
        hasLink: !!trackingLink,
        trackingLink: trackingLink || 'not available yet',
      });

      // Notify progress callback
      if (onProgress) {
        onProgress(status, elapsedSeconds);
      }

      // Check if tracking link is available
      if (status === 'active' && trackingLink) {
        // SUCCESS! Tracking link is available
        const successMsg = `✅ Tracking link available: ${trackingLink}`;
        logger.success('tonic', successMsg, {
          campaignId,
          trackingLink,
          elapsedSeconds,
          attemptsCount,
        });

        return {
          success: true,
          trackingLink,
          campaignStatus: status,
          elapsedSeconds,
          attemptsCount,
        };
      } else if (status === 'pending' || status === 'incomplete') {
        // Still processing
        const remainingMinutes = Math.ceil((maxWaitMs - elapsedMs) / 60000);
        logger.info('tonic', `⏳ Campaign still processing...`, {
          status,
          elapsedSeconds,
          remainingMinutes,
          nextCheckIn: pollingIntervalSeconds,
        });

        // Wait before next check
        await sleep(pollingIntervalMs);
      } else if (status === 'stopped' || status === 'deleted') {
        // Campaign was stopped or deleted
        const errorMsg = `❌ Campaign status is ${status}, cannot get tracking link`;
        logger.error('tonic', errorMsg, {
          campaignId,
          status,
          elapsedSeconds,
          attemptsCount,
        });

        return {
          success: false,
          campaignStatus: status,
          error: errorMsg,
          elapsedSeconds,
          attemptsCount,
        };
      } else {
        // Unknown status or active but no link yet
        logger.warn('tonic', `⚠️  Unexpected response, retrying...`, {
          status,
          hasLink: !!trackingLink,
          response: campaignStatus,
        });

        // Wait before next check
        await sleep(pollingIntervalMs);
      }
    } catch (error: any) {
      logger.error('tonic', `❌ Error checking campaign status: ${error.message}`, {
        campaignId,
        error: error.message,
        elapsedSeconds,
        attemptsCount,
      });

      // If error fetching status, wait and retry
      // Don't fail immediately in case it's a temporary network issue
      await sleep(pollingIntervalMs);
    }
  }
}

/**
 * Helper function to sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format elapsed time in human-readable format
 */
export function formatPollingTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}
