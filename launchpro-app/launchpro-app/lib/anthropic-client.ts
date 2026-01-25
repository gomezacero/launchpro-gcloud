/**
 * Singleton Anthropic Client - v2.3.0
 *
 * CRITICAL: This module provides a single, shared Anthropic client instance.
 * This fixes the 401 "invalid x-api-key" error that occurs when multiple
 * campaigns are processed in parallel and each creates its own client.
 *
 * IMPROVEMENTS in v2.3.0:
 * - Lazy initialization: Client is created on first use, not at module load
 * - Key validation: Validates API key format and recreates client if key changes
 * - Better error handling: Clears error state on retry, allowing recovery
 * - No early initialization that could fail in serverless cold starts
 */

import Anthropic from '@anthropic-ai/sdk';

// Singleton state
let _client: Anthropic | null = null;
let _lastKeyHash: string | null = null;

// Track instance for debugging across serverless invocations
const INSTANCE_ID = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
console.log(`[AnthropicClient] Module loaded - Instance ID: ${INSTANCE_ID}`);

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

/**
 * Generate a hash of the key for comparison (without storing the full key)
 */
function getKeyHash(key: string): string {
  if (!key) return 'EMPTY';
  return `${key.length}-${key.substring(0, 10)}-${key.substring(key.length - 6)}`;
}

/**
 * Validate that the API key has the expected Anthropic format
 */
function validateApiKey(apiKey: string): { valid: boolean; error?: string } {
  if (!apiKey) {
    return { valid: false, error: 'ANTHROPIC_API_KEY is not configured or empty' };
  }

  if (apiKey.length < 50) {
    return { valid: false, error: `ANTHROPIC_API_KEY too short (${apiKey.length} chars, expected 50+)` };
  }

  if (!apiKey.startsWith('sk-ant-')) {
    return { valid: false, error: `ANTHROPIC_API_KEY has unexpected format (should start with sk-ant-)` };
  }

  return { valid: true };
}

/**
 * Get the singleton Anthropic client
 *
 * This function uses lazy initialization and validates the API key on each call.
 * If the key has changed (e.g., after a Vercel redeploy), the client is recreated.
 *
 * @throws Error if API key is invalid or missing
 */
export function getAnthropicClient(): Anthropic {
  const apiKey = getCleanApiKey();
  const currentKeyHash = getKeyHash(apiKey);

  // Log debug info
  console.log(`[AnthropicClient.getAnthropicClient] Client requested:`, {
    instanceId: INSTANCE_ID,
    hasClient: !!_client,
    keyHash: currentKeyHash,
    lastKeyHash: _lastKeyHash,
    keyChanged: _lastKeyHash !== null && _lastKeyHash !== currentKeyHash,
    timestamp: new Date().toISOString(),
  });

  // Check if we need to create or recreate the client
  const needsNewClient = !_client || _lastKeyHash !== currentKeyHash;

  if (needsNewClient) {
    // Validate the API key before creating client
    const validation = validateApiKey(apiKey);
    if (!validation.valid) {
      console.error(`[AnthropicClient] API key validation failed:`, validation.error);
      throw new Error(`[AnthropicClient] ${validation.error}`);
    }

    // Log why we're creating/recreating
    if (!_client) {
      console.log(`[AnthropicClient] Creating new client (first initialization)`);
    } else {
      console.log(`[AnthropicClient] Recreating client (key hash changed from ${_lastKeyHash} to ${currentKeyHash})`);
    }

    try {
      _client = new Anthropic({ apiKey });
      _lastKeyHash = currentKeyHash;
      console.log(`[AnthropicClient] Client created successfully (instance: ${INSTANCE_ID})`);
    } catch (error: any) {
      console.error(`[AnthropicClient] Failed to create client:`, error.message);
      // Reset state so next call can retry
      _client = null;
      _lastKeyHash = null;
      throw new Error(`[AnthropicClient] Failed to create client: ${error.message}`);
    }
  }

  console.log(`[AnthropicClient] Returning client (instance: ${INSTANCE_ID})`);
  return _client!;
}

/**
 * Get API key info for debugging (without exposing full key)
 */
export function getApiKeyDebugInfo(): {
  exists: boolean;
  length: number;
  preview: string;
  startsWithSkAnt: boolean;
  instanceId: string;
  hasClient: boolean;
  keyHash: string;
} {
  const apiKey = getCleanApiKey();
  return {
    exists: !!apiKey,
    length: apiKey.length,
    preview: apiKey ? `${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 6)}` : 'MISSING',
    startsWithSkAnt: apiKey.startsWith('sk-ant-'),
    instanceId: INSTANCE_ID,
    hasClient: !!_client,
    keyHash: getKeyHash(apiKey),
  };
}

/**
 * Force reset the client (useful for testing or recovery)
 * This will cause the next getAnthropicClient() call to create a fresh client
 */
export function resetClient(): void {
  console.log(`[AnthropicClient] Client reset requested (instance: ${INSTANCE_ID})`);
  _client = null;
  _lastKeyHash = null;
}
