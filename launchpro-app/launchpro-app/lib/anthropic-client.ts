/**
 * Singleton Anthropic Client
 *
 * CRITICAL: This module provides a single, shared Anthropic client instance.
 * This fixes the 401 "invalid x-api-key" error that occurs when multiple
 * campaigns are processed in parallel and each creates its own client.
 *
 * The issue was that concurrent client creation could cause race conditions
 * in environment variable reading or SDK initialization.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Get clean Anthropic API key from environment
 * Handles: whitespace, newlines, copy/paste issues, and surrounding quotes
 */
function getCleanApiKey(): string {
  const rawKey = process.env.ANTHROPIC_API_KEY || '';

  // Remove ALL non-printable characters (handles copy/paste issues)
  let cleanedKey = rawKey
    .split('')
    .filter(c => c.charCodeAt(0) >= 33 && c.charCodeAt(0) <= 126)
    .join('');

  // Remove surrounding quotes if present (common Vercel env var issue)
  if (
    (cleanedKey.startsWith('"') && cleanedKey.endsWith('"')) ||
    (cleanedKey.startsWith("'") && cleanedKey.endsWith("'"))
  ) {
    cleanedKey = cleanedKey.slice(1, -1);
  }

  return cleanedKey;
}

// Create the singleton client ONCE at module load time
let _client: Anthropic | null = null;
let _initError: Error | null = null;

function initializeClient(): void {
  if (_client !== null || _initError !== null) {
    return; // Already initialized
  }

  try {
    const apiKey = getCleanApiKey();

    if (!apiKey) {
      _initError = new Error('[AnthropicClient] ANTHROPIC_API_KEY not configured');
      console.error(_initError.message);
      return;
    }

    if (!apiKey.startsWith('sk-ant-')) {
      console.warn('[AnthropicClient] ⚠️ ANTHROPIC_API_KEY has unexpected format');
    }

    console.log('[AnthropicClient] Initializing singleton client:', {
      keyLength: apiKey.length,
      keyStart: apiKey.substring(0, 15),
      keyEnd: apiKey.substring(apiKey.length - 6),
      timestamp: new Date().toISOString(),
    });

    _client = new Anthropic({ apiKey });

    console.log('[AnthropicClient] ✅ Singleton client initialized successfully');
  } catch (error: any) {
    _initError = error;
    console.error('[AnthropicClient] ❌ Failed to initialize:', error.message);
  }
}

// Initialize on module load
initializeClient();

/**
 * Get the singleton Anthropic client
 * @throws Error if client initialization failed
 */
export function getAnthropicClient(): Anthropic {
  if (_initError) {
    throw _initError;
  }

  if (!_client) {
    // Try to initialize again (in case of lazy loading)
    initializeClient();

    if (_initError) {
      throw _initError;
    }

    if (!_client) {
      throw new Error('[AnthropicClient] Client not initialized');
    }
  }

  return _client;
}

/**
 * Get API key info for debugging (without exposing full key)
 */
export function getApiKeyDebugInfo(): {
  exists: boolean;
  length: number;
  preview: string;
  startsWithSkAnt: boolean;
} {
  const apiKey = getCleanApiKey();
  return {
    exists: !!apiKey,
    length: apiKey.length,
    preview: apiKey ? `${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 6)}` : 'MISSING',
    startsWithSkAnt: apiKey.startsWith('sk-ant-'),
  };
}
