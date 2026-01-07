/**
 * RSOC Creative Neural Engine - Model Configurations
 *
 * Optimized model selection per agent based on:
 * - Cost efficiency (DeepSeek is 5-10x cheaper)
 * - Capability requirements (reasoning vs structured output)
 * - Fallback chains for reliability
 */

import { AgentConfig, ModelConfig } from '../types';

// ============================================================================
// MODEL PRICING (per 1M tokens, as of Jan 2026)
// ============================================================================

export const MODEL_COSTS = {
  // DeepSeek - Most cost-effective
  'deepseek-v3.2-cached': { input: 0.028, output: 0.42 },
  'deepseek-v3.2': { input: 0.28, output: 0.42 },

  // Google - Good for grounding
  'gemini-2.0-flash': { input: 0.15, output: 0.60 },
  'gemini-1.5-pro': { input: 1.25, output: 5.0 },

  // OpenAI - Reliable fallback
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.5, output: 10.0 },

  // Anthropic - Best reasoning
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },

  // Embeddings
  'text-embedding-004': { input: 0.00001, output: 0 }, // Per character
  'text-embedding-3-small': { input: 0.02, output: 0 },
} as const;

// ============================================================================
// AGENT CONFIGURATIONS
// ============================================================================

/**
 * Global Scout - Cultural Research Agent
 *
 * Requires: Google Search Grounding (only Gemini has this natively)
 * Task: Research country/vertical context in real-time
 * Complexity: Low-Medium (extraction, not reasoning)
 */
export const GLOBAL_SCOUT_CONFIG: AgentConfig = {
  name: 'GlobalScout',
  model: {
    provider: 'google',
    model: 'gemini-2.0-flash',
    temperature: 0.3, // Low for factual extraction
    maxTokens: 2000,
  },
  fallbackModels: [
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 2000,
    },
    {
      provider: 'deepseek',
      model: 'deepseek-v3.2',
      temperature: 0.3,
      maxTokens: 2000,
    },
  ],
  maxRetries: 2,
  timeoutMs: 30000,
  cacheEnabled: true,
  cacheTtlSeconds: 86400, // 24 hours
};

/**
 * Asset Manager - RAG Agent
 *
 * Requires: Only embeddings (no LLM inference)
 * Task: Retrieve top ads, safe copies, similar campaigns
 * Complexity: None (pure vector search)
 */
export const ASSET_MANAGER_CONFIG: AgentConfig = {
  name: 'AssetManager',
  model: {
    provider: 'google',
    model: 'text-embedding-004',
    temperature: 0, // Not used for embeddings
    maxTokens: 0, // Not used for embeddings
  },
  fallbackModels: [
    {
      provider: 'openai',
      model: 'text-embedding-3-small',
      temperature: 0,
      maxTokens: 0,
    },
  ],
  maxRetries: 2,
  timeoutMs: 10000,
  cacheEnabled: true,
  cacheTtlSeconds: 604800, // 7 days
};

/**
 * Angle Strategist - Creative Director Agent
 *
 * Requires: Complex reasoning, large context window
 * Task: Cross-reference cultural context with assets to define strategy
 * Complexity: High (strategic reasoning)
 */
export const ANGLE_STRATEGIST_CONFIG: AgentConfig = {
  name: 'AngleStrategist',
  model: {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7, // Higher for creative strategy
    maxTokens: 3000,
  },
  fallbackModels: [
    {
      provider: 'google',
      model: 'gemini-1.5-pro',
      temperature: 0.7,
      maxTokens: 3000,
    },
    {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 3000,
    },
  ],
  maxRetries: 2,
  timeoutMs: 45000,
  cacheEnabled: true,
  cacheTtlSeconds: 43200, // 12 hours
};

/**
 * Visual Engineer - Prompt Engineering Agent
 *
 * Requires: Structured output, image gen prompt expertise
 * Task: Convert strategy concepts to optimized image prompts
 * Complexity: Medium (structured transformation)
 */
export const VISUAL_ENGINEER_CONFIG: AgentConfig = {
  name: 'VisualEngineer',
  model: {
    provider: 'google',
    model: 'gemini-2.0-flash',
    temperature: 0.5,
    maxTokens: 1500,
  },
  fallbackModels: [
    {
      provider: 'deepseek',
      model: 'deepseek-v3.2',
      temperature: 0.5,
      maxTokens: 1500,
    },
    {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1500,
    },
  ],
  maxRetries: 2,
  timeoutMs: 20000,
  cacheEnabled: true,
  cacheTtlSeconds: 604800, // 7 days
};

/**
 * Compliance Assembler - Deterministic Assembly
 *
 * Requires: NO LLM - Pure code (Pillow/Sharp)
 * Task: Composite text over generated images
 * Complexity: None (deterministic)
 */
export const COMPLIANCE_ASSEMBLER_CONFIG: AgentConfig = {
  name: 'ComplianceAssembler',
  model: {
    provider: 'google', // Not used
    model: 'none',
    temperature: 0,
    maxTokens: 0,
  },
  fallbackModels: [],
  maxRetries: 3, // For image processing errors
  timeoutMs: 30000,
  cacheEnabled: false, // Each assembly is unique
  cacheTtlSeconds: 0,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get all agent configs as a map
 */
export function getAllAgentConfigs(): Record<string, AgentConfig> {
  return {
    globalScout: GLOBAL_SCOUT_CONFIG,
    assetManager: ASSET_MANAGER_CONFIG,
    angleStrategist: ANGLE_STRATEGIST_CONFIG,
    visualEngineer: VISUAL_ENGINEER_CONFIG,
    complianceAssembler: COMPLIANCE_ASSEMBLER_CONFIG,
  };
}

/**
 * Estimate cost for a given model and token counts
 */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model as keyof typeof MODEL_COSTS];
  if (!costs) {
    console.warn(`Unknown model for cost estimation: ${model}`);
    return 0;
  }

  return (inputTokens / 1_000_000) * costs.input + (outputTokens / 1_000_000) * costs.output;
}

/**
 * Get next fallback model from config
 */
export function getNextFallback(
  config: AgentConfig,
  failedModels: string[]
): ModelConfig | null {
  for (const fallback of config.fallbackModels) {
    if (!failedModels.includes(fallback.model)) {
      return fallback;
    }
  }
  return null;
}

/**
 * Estimate total cost per campaign
 */
export function estimateCampaignCost(): {
  withoutCache: number;
  withCache60: number;
  breakdown: Record<string, number>;
} {
  // Estimated token usage per agent
  const usage = {
    globalScout: { input: 2000, output: 1500 },
    angleStrategist: { input: 4000, output: 2000 },
    visualEngineer: { input: 1500, output: 1000 },
  };

  const breakdown: Record<string, number> = {};

  // Global Scout (Gemini Flash)
  breakdown.globalScout = estimateCost(
    'gemini-2.0-flash',
    usage.globalScout.input,
    usage.globalScout.output
  );

  // Asset Manager (embeddings only)
  breakdown.assetManager = 0.0001; // ~5 embedding queries

  // Angle Strategist (Claude Sonnet)
  breakdown.angleStrategist = estimateCost(
    'claude-3-5-sonnet-20241022',
    usage.angleStrategist.input,
    usage.angleStrategist.output
  );

  // Visual Engineer (Gemini Flash)
  breakdown.visualEngineer = estimateCost(
    'gemini-2.0-flash',
    usage.visualEngineer.input,
    usage.visualEngineer.output
  );

  // Compliance Assembler (no LLM cost)
  breakdown.complianceAssembler = 0;

  // Media generation (fixed costs)
  breakdown.imageGeneration = 0.02; // Imagen 4
  breakdown.videoGeneration = 0.10; // Veo 3.1

  const withoutCache = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const llmCosts =
    breakdown.globalScout + breakdown.angleStrategist + breakdown.visualEngineer;
  const withCache60 = withoutCache - llmCosts * 0.6;

  return {
    withoutCache,
    withCache60,
    breakdown,
  };
}
