/**
 * Retry Logic Utility
 * Provides retry mechanism for API calls with exponential backoff
 */

import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number; // Default: 3
  initialDelayMs?: number; // Default: 1000
  maxDelayMs?: number; // Default: 10000
  backoffMultiplier?: number; // Default: 2
  retryableErrors?: string[]; // Specific error messages to retry
  retryableStatusCodes?: number[]; // HTTP status codes to retry (e.g., 429, 500, 502, 503)
}

export class RetryableError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
  context?: string
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    retryableStatusCodes = [429, 500, 502, 503, 504],
  } = options;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn();

      if (attempt > 1) {
        logger.success('system', `${context || 'Operation'} succeeded on attempt ${attempt}`);
      }

      return result;
    } catch (error: any) {
      lastError = error;

      // Check if this is the last attempt
      if (attempt > maxRetries) {
        break;
      }

      // Check if error is retryable
      const isRetryableStatus = retryableStatusCodes.includes(error.response?.status);
      const isRetryableError = error instanceof RetryableError;

      if (!isRetryableStatus && !isRetryableError) {
        // This error is not retryable, fail immediately
        logger.error('system', `${context || 'Operation'} failed with non-retryable error`, {
          error: error.message,
          attempt,
        });
        throw error;
      }

      // Log retry attempt
      logger.warn('system', `${context || 'Operation'} failed, retrying...`, {
        attempt,
        maxRetries,
        nextRetryIn: `${delay}ms`,
        error: error.message,
        status: error.response?.status,
      });

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  // All retries exhausted
  logger.error('system', `${context || 'Operation'} failed after ${maxRetries + 1} attempts`, {
    error: lastError?.message,
  });

  throw new Error(
    `${context || 'Operation'} failed after ${maxRetries + 1} attempts: ${lastError?.message}`
  );
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for specific API services
 */
export const retryAPI = {
  /**
   * Retry Tonic API call
   */
  tonic: async <T>(fn: () => Promise<T>, context?: string): Promise<T> => {
    return retry(fn, {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryableStatusCodes: [429, 500, 502, 503],
    }, `Tonic API: ${context || 'call'}`);
  },

  /**
   * Retry Meta API call
   */
  meta: async <T>(fn: () => Promise<T>, context?: string): Promise<T> => {
    return retry(fn, {
      maxRetries: 3,
      initialDelayMs: 2000,
      retryableStatusCodes: [429, 500, 502, 503],
    }, `Meta API: ${context || 'call'}`);
  },

  /**
   * Retry TikTok API call
   */
  tiktok: async <T>(fn: () => Promise<T>, context?: string): Promise<T> => {
    return retry(fn, {
      maxRetries: 3,
      initialDelayMs: 2000,
      retryableStatusCodes: [429, 500, 502, 503],
    }, `TikTok API: ${context || 'call'}`);
  },

  /**
   * Retry AI generation call (higher retry count due to transient failures)
   */
  ai: async <T>(fn: () => Promise<T>, context?: string): Promise<T> => {
    return retry(fn, {
      maxRetries: 5,
      initialDelayMs: 3000,
      maxDelayMs: 30000,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    }, `AI Generation: ${context || 'call'}`);
  },
};
