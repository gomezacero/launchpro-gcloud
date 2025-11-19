import { tonicService } from '@/services/tonic.service';
import { logger } from '@/lib/logger';
import { TonicCredentials } from '@/services/tonic.service';

/**
 * Article Approval Polling Utility
 *
 * Waits for Tonic to approve an RSOC article request before continuing with campaign creation.
 * This is CRITICAL because RSOC campaigns require a valid headline_id.
 */

export interface ArticleRequestStatus {
  request_id: string;
  headline_id: string | null;
  request_status: 'pending' | 'published' | 'rejected' | 'in_review';
  rejection_reason?: string;
  country: string;
  offer: string;
  language: string;
  content_generation_phrases: string[];
}

export interface PollingOptions {
  maxWaitMinutes?: number; // Maximum time to wait (default: 60 minutes)
  pollingIntervalSeconds?: number; // How often to check (default: 30 seconds)
  onProgress?: (status: ArticleRequestStatus, elapsedSeconds: number) => void; // Callback for progress updates
}

export interface PollingResult {
  success: boolean;
  headlineId?: string;
  status?: string;
  error?: string;
  elapsedSeconds: number;
  attemptsCount: number;
}

/**
 * Wait for an article request to be approved by Tonic
 *
 * @param credentials - Tonic API credentials
 * @param requestId - The article request ID returned from createArticleRequest()
 * @param options - Polling options
 * @returns PollingResult with headline_id if approved
 */
export async function waitForArticleApproval(
  credentials: TonicCredentials,
  requestId: number,
  options: PollingOptions = {}
): Promise<PollingResult> {
  const {
    maxWaitMinutes = 60,
    pollingIntervalSeconds = 30,
    onProgress,
  } = options;

  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  const pollingIntervalMs = pollingIntervalSeconds * 1000;
  const startTime = Date.now();
  let attemptsCount = 0;

  logger.info('tonic', `⏳ Starting to wait for article approval...`, {
    requestId,
    maxWaitMinutes,
    pollingIntervalSeconds,
  });

  while (true) {
    const elapsedMs = Date.now() - startTime;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    attemptsCount++;

    // Check timeout
    if (elapsedMs >= maxWaitMs) {
      const errorMsg = `⏰ Timeout: Article approval took longer than ${maxWaitMinutes} minutes`;
      logger.warn('tonic', errorMsg, {
        requestId,
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
      // Fetch article request status
      logger.info('tonic', `🔍 Checking article status (attempt ${attemptsCount})...`, {
        requestId,
        elapsedSeconds,
      });

      const articleRequest = await tonicService.getArticleRequest(credentials, requestId);

      logger.info('tonic', `📄 Article request status: ${articleRequest.request_status}`, {
        requestId,
        status: articleRequest.request_status,
        headlineId: articleRequest.headline_id,
        offer: articleRequest.offer,
        country: articleRequest.country,
      });

      // Notify progress callback
      if (onProgress) {
        onProgress(articleRequest, elapsedSeconds);
      }

      // Check status
      if (articleRequest.request_status === 'published') {
        // SUCCESS! Article approved
        const successMsg = `✅ Article approved! headline_id: ${articleRequest.headline_id}`;
        logger.success('tonic', successMsg, {
          requestId,
          headlineId: articleRequest.headline_id,
          elapsedSeconds,
          attemptsCount,
        });

        return {
          success: true,
          headlineId: articleRequest.headline_id,
          status: 'published',
          elapsedSeconds,
          attemptsCount,
        };
      } else if (articleRequest.request_status === 'rejected') {
        // REJECTED! Article was not approved
        const errorMsg = `❌ Article was rejected: ${articleRequest.rejection_reason || 'No reason provided'}`;
        logger.error('tonic', errorMsg, {
          requestId,
          rejectionReason: articleRequest.rejection_reason,
          elapsedSeconds,
          attemptsCount,
        });

        return {
          success: false,
          status: 'rejected',
          error: errorMsg,
          elapsedSeconds,
          attemptsCount,
        };
      } else {
        // Still pending or in review
        const remainingMinutes = Math.ceil((maxWaitMs - elapsedMs) / 60000);
        logger.info('tonic', `⏳ Article still pending approval...`, {
          status: articleRequest.request_status,
          elapsedSeconds,
          remainingMinutes,
          nextCheckIn: pollingIntervalSeconds,
        });

        // Wait before next check
        await sleep(pollingIntervalMs);
      }
    } catch (error: any) {
      logger.error('tonic', `❌ Error checking article status: ${error.message}`, {
        requestId,
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
export function formatElapsedTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Check if article approval is likely to succeed quickly
 * (useful for deciding whether to wait or use existing headlines)
 */
export async function checkArticleRequestStatus(
  credentials: TonicCredentials,
  requestId: number
): Promise<ArticleRequestStatus> {
  try {
    const articleRequest = await tonicService.getArticleRequest(credentials, requestId);
    return articleRequest;
  } catch (error: any) {
    logger.error('tonic', `Failed to check article request status: ${error.message}`, {
      requestId,
      error: error.message,
    });
    throw error;
  }
}
