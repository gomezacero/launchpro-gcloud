/**
 * Anthropic Client Factory - v2.4.0 FRESH CLIENT MODE
 *
 * CHANGE LOG v2.4.0:
 * - REMOVED SINGLETON PATTERN: Each call now creates a FRESH client
 * - This fixes mysterious 401 errors that occur after long operations in Vercel serverless
 * - The Anthropic SDK creates connections that may become stale/corrupted in long-running functions
 * - Creating a fresh client for each operation ensures the API key is always validated fresh
 *
 * PREVIOUS ISSUE:
 * - Campaigns that stay in GENERATING_AI for 10+ minutes would fail with 401
 * - The singleton client would become corrupted somehow during long media generation
 * - This happened even though the API key was valid (diagnostic endpoints worked)
 */

import Anthropic from '@anthropic-ai/sdk';

// Track invocations for debugging
let _invocationCount = 0;
const MODULE_LOAD_TIME = Date.now();
const INSTANCE_ID = `${MODULE_LOAD_TIME}-${Math.random().toString(36).substring(2, 8)}`;
console.log(`[AnthropicClient v2.4.0] Module loaded - Instance ID: ${INSTANCE_ID} - FRESH CLIENT MODE`);

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
 * Get a FRESH Anthropic client for each call
 *
 * v2.4.0: Creates a new client instance every time to avoid stale connection issues
 * in Vercel serverless. This is less efficient but more reliable.
 *
 * @throws Error if API key is invalid or missing
 */
export function getAnthropicClient(): Anthropic {
  _invocationCount++;
  const callId = `${INSTANCE_ID}-call-${_invocationCount}`;

  const apiKey = getCleanApiKey();
  const currentKeyHash = getKeyHash(apiKey);

  // Log debug info
  console.log(`[AnthropicClient v2.4.0] Creating FRESH client:`, {
    callId,
    instanceId: INSTANCE_ID,
    invocationCount: _invocationCount,
    keyHash: currentKeyHash,
    timeSinceModuleLoad: `${Math.round((Date.now() - MODULE_LOAD_TIME) / 1000)}s`,
    timestamp: new Date().toISOString(),
  });

  // Validate the API key
  const validation = validateApiKey(apiKey);
  if (!validation.valid) {
    console.error(`[AnthropicClient v2.4.0] API key validation failed:`, validation.error);
    throw new Error(`[AnthropicClient] ${validation.error}`);
  }

  try {
    // CREATE FRESH CLIENT EVERY TIME
    const client = new Anthropic({ apiKey });
    console.log(`[AnthropicClient v2.4.0] Fresh client created successfully (callId: ${callId})`);
    return client;
  } catch (error: any) {
    console.error(`[AnthropicClient v2.4.0] Failed to create client:`, error.message);
    throw new Error(`[AnthropicClient] Failed to create client: ${error.message}`);
  }
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
  invocationCount: number;
  keyHash: string;
  mode: string;
} {
  const apiKey = getCleanApiKey();
  return {
    exists: !!apiKey,
    length: apiKey.length,
    preview: apiKey ? `${apiKey.substring(0, 15)}...${apiKey.substring(apiKey.length - 6)}` : 'MISSING',
    startsWithSkAnt: apiKey.startsWith('sk-ant-'),
    instanceId: INSTANCE_ID,
    invocationCount: _invocationCount,
    keyHash: getKeyHash(apiKey),
    mode: 'FRESH_CLIENT_v2.4.0',
  };
}

/**
 * Reset the invocation counter (for testing)
 * Note: In v2.4.0 there's no client to reset since we create fresh ones each time
 */
export function resetClient(): void {
  console.log(`[AnthropicClient v2.4.0] Reset requested - no action needed (fresh client mode)`);
  _invocationCount = 0;
}
