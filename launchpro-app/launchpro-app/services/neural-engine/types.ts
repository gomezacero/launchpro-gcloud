/**
 * RSOC Creative Neural Engine - Type Definitions
 *
 * Core types for the multi-agent system that orchestrates creative generation
 * for Search Arbitrage campaigns at global scale.
 */

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface NeuralEngineInput {
  // Campaign context
  offer: OfferContext;
  country: string;
  language: string;
  platform: 'META' | 'TIKTOK';

  // Optional overrides
  communicationAngle?: CommunicationAngle;
  copyMaster?: string;

  // Visual customization (NEW)
  visualStyle?: VisualStyleType;
  includeTextOverlay?: boolean;
  customTextOverlay?: string; // If provided, use this instead of safe copy
  referenceImageUrl?: string; // URL of reference image to guide style generation

  // Feature flags
  useCache?: boolean;
  useFallbackModels?: boolean;
  previewMode?: boolean; // If true, skip some optimizations for faster preview
}

/**
 * Visual Style Types for Image Generation
 * Provides variety in generated creative assets
 */
export type VisualStyleType =
  | 'photography'      // Realistic photography (current default)
  | 'ugc'              // User-generated content style (amateur/native)
  | 'graphic_design'   // Clean graphic design, illustrations
  | 'text_centric'     // Bold text-focused design with minimal imagery
  | 'editorial'        // Magazine/lifestyle editorial style
  | 'minimalist';      // Clean, simple, minimal elements

export interface OfferContext {
  id: string;
  name: string;
  vertical: string;
  description?: string;
  tonicOfferId?: string;
}

export type CommunicationAngle =
  | 'emotional'
  | 'rational'
  | 'urgency'
  | 'social_proof'
  | 'curiosity'
  | 'authority'
  | 'fear_of_missing_out'
  | 'aspiration';

// ============================================================================
// AGENT STATE TYPES
// ============================================================================

export interface NeuralEngineState {
  // Input (immutable)
  input: NeuralEngineInput;

  // Agent outputs (mutable as pipeline progresses)
  culturalContext?: CulturalContext;
  retrievedAssets?: RetrievedAssets;
  strategyBrief?: StrategyBrief;
  visualPrompts?: VisualPrompt[];
  assembledCreative?: AssembledCreative;

  // Final output
  creativePackage?: CreativePackage;

  // Metadata
  cacheHits: string[];
  errors: AgentError[];
  timing: TimingMetrics;
}

export interface CulturalContext {
  // Country-specific insights
  country: string;
  language: string;
  timezone: string;
  currentSeason: string;

  // Cultural codes
  visualCodes: string[];
  colorPreferences: string[];
  taboos: string[];

  // Market context
  competitorActivity: string[];
  currentTrends: string[];
  searchTrends: string[];

  // Demographics
  targetDemographic: {
    ageRange: string;
    gender: string;
    interests: string[];
  };

  // Timestamp
  researchedAt: Date;
}

export interface RetrievedAssets {
  // Top performing ads from history
  topAds: TopAdReference[];

  // Pre-approved copy options
  safeCopies: SafeCopyOption[];

  // Blacklisted terms
  blacklistedTerms: string[];

  // Similar campaigns for reference
  similarCampaigns: CampaignReference[];
}

export interface TopAdReference {
  id: string;
  platform: 'META' | 'TIKTOK';
  vertical: string;
  country: string;

  // Content
  headline: string;
  primaryText: string;
  description?: string;
  imageUrl?: string;

  // Performance
  ctr: number;
  roas: number;
  spend: number;
  conversions: number;

  // Similarity score (from RAG)
  similarityScore: number;
}

export interface SafeCopyOption {
  id: string;
  copyType: 'headline' | 'primaryText' | 'description' | 'cta';
  content: string;
  vertical: string;
  platform: 'META' | 'TIKTOK';
  language: string;

  // Compliance
  approved: boolean;
  approvedBy?: string;

  // Performance
  usageCount: number;
  avgCtr?: number;
}

export interface CampaignReference {
  id: string;
  name: string;
  vertical: string;
  country: string;
  roas: number;
  copyMaster: string;
  angle: CommunicationAngle;
}

export interface StrategyBrief {
  // Selected angle
  primaryAngle: CommunicationAngle;
  secondaryAngle?: CommunicationAngle;

  // Copy strategy
  copyMaster: string;
  keyMessage: string;
  emotionalHook: string;

  // Visual direction
  visualConcept: string;
  visualStyle: 'ugc' | 'professional' | 'native' | 'editorial';
  colorPalette: string[];

  // Platform-specific adaptations
  platformAdaptations: {
    meta?: PlatformAdaptation;
    tiktok?: PlatformAdaptation;
  };
}

export interface PlatformAdaptation {
  headline: string;
  primaryText: string;
  description: string;
  callToAction: string;
}

export interface VisualPrompt {
  // Prompt for image generation
  prompt: string;
  negativePrompt: string;

  // Specifications
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  style: 'photorealistic' | 'illustration' | 'ugc' | 'graphic_design' | 'text_centric' | 'editorial' | 'minimalist';

  // Brand safety
  safetyLevel: 'strict' | 'moderate';

  // Reference
  conceptId: string;
  variation: number;

  // Text overlay configuration (NEW)
  includeTextOverlay?: boolean;
  textOverlayContent?: string;
}

export interface AssembledCreative {
  // Base image (from AI generation)
  baseImageUrl: string;
  baseImageGcsPath: string;

  // Final composite (with text overlay)
  finalImageUrl: string;
  finalImageGcsPath: string;

  // Text used (from SafeCopy repository)
  textOverlay: {
    headline: string;
    subheadline?: string;
    cta: string;
  };

  // Dimensions
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

export interface CreativePackage {
  // Identification
  id: string;
  generatedAt: Date;

  // Campaign context
  offerId: string;
  country: string;
  platform: 'META' | 'TIKTOK';

  // Copy
  copy: {
    copyMaster: string;
    headline: string;
    primaryText: string;
    description: string;
    callToAction: string;
  };

  // Visuals
  visuals: {
    images: GeneratedImage[];
    videos?: GeneratedVideo[];
  };

  // Strategy
  strategy: {
    angle: CommunicationAngle;
    visualConcept: string;
  };

  // Metadata
  metadata: {
    cacheHits: string[];
    modelsUsed: ModelUsage[];
    totalCost: number;
    generationTimeMs: number;
  };
}

export interface GeneratedImage {
  id: string;
  url: string;
  gcsPath: string;
  width: number;
  height: number;
  aspectRatio: string;
  hasTextOverlay: boolean;
}

export interface GeneratedVideo {
  id: string;
  url: string;
  gcsPath: string;
  durationSeconds: number;
  aspectRatio: string;
}

// ============================================================================
// CONFIG TYPES
// ============================================================================

export interface AgentConfig {
  name: string;
  model: ModelConfig;
  fallbackModels: ModelConfig[];
  maxRetries: number;
  timeoutMs: number;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
}

export interface ModelConfig {
  provider: 'anthropic' | 'google' | 'openai' | 'deepseek';
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ModelUsage {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  latencyMs: number;
  fromCache: boolean;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface AgentError {
  agent: string;
  error: string;
  code: AgentErrorCode;
  timestamp: Date;
  recoverable: boolean;
  fallbackUsed?: string;
}

export type AgentErrorCode =
  | 'MODEL_ERROR'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'CACHE_ERROR'
  | 'EMBEDDING_ERROR'
  | 'IMAGE_GENERATION_ERROR'
  | 'ASSEMBLY_ERROR'
  | 'UNKNOWN';

// ============================================================================
// CACHE TYPES
// ============================================================================

export interface CacheEntry<T> {
  key: string;
  data: T;
  embedding?: number[];
  createdAt: Date;
  expireAt: Date;
  hitCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  avgLatencyMs: number;
}

// ============================================================================
// TIMING TYPES
// ============================================================================

export interface TimingMetrics {
  startedAt: Date;
  completedAt?: Date;
  totalMs?: number;
  agentTimings: {
    [agentName: string]: {
      startedAt: Date;
      completedAt?: Date;
      durationMs?: number;
    };
  };
}

// ============================================================================
// RAG TYPES
// ============================================================================

export interface EmbeddingDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface SimilarityResult {
  document: EmbeddingDocument;
  similarity: number;
}

// ============================================================================
// FLYWHEEL TYPES
// ============================================================================

export interface PerformanceMetrics {
  campaignId: string;
  creativeId: string;
  platform: 'META' | 'TIKTOK';

  // Engagement
  impressions: number;
  clicks: number;
  ctr: number;

  // Conversion
  conversions: number;
  conversionRate: number;

  // Financial
  spend: number;
  revenue: number;
  roas: number;
  cpa: number;

  // Creative metadata
  copyMaster: string;
  communicationAngle: CommunicationAngle;
  visualConcept: string;

  // System metadata
  agentVersion: string;
  modelUsed: string;
  cacheHit: boolean;

  // Timestamp
  recordedAt: Date;
}
