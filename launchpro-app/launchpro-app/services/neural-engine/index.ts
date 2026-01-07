/**
 * RSOC Creative Neural Engine
 *
 * Multi-agent system for automated creative generation at global scale.
 * Optimized for Search Arbitrage campaigns across 2,000+ categories x 150+ countries.
 *
 * Architecture:
 * - Global Scout: Cultural research with Google Search Grounding
 * - Asset Manager: RAG-based retrieval of top ads and safe copies
 * - Angle Strategist: Creative direction with complex reasoning
 * - Visual Engineer: Image prompt optimization
 * - Compliance Assembler: Deterministic text overlay (100% brand safe)
 */

// Types
export * from './types';

// Configuration
export * from './config/model-configs';

// Cache
export { SemanticCacheService, getSemanticCacheService, CacheKeys } from './cache/semantic-cache.service';

// RAG / Embeddings
export { EmbeddingsService, getEmbeddingsService, prepareTextForEmbedding, combineTextsForEmbedding } from './rag/embeddings.service';

// Agents
export { GlobalScoutAgent, getGlobalScoutAgent } from './agents/global-scout.agent';
export { AssetManagerAgent, getAssetManagerAgent } from './agents/asset-manager.agent';
export { AngleStrategistAgent, getAngleStrategistAgent } from './agents/angle-strategist.agent';
export { VisualEngineerAgent, getVisualEngineerAgent } from './agents/visual-engineer.agent';
export { ComplianceAssembler, getComplianceAssembler } from './agents/compliance-assembler';

// Orchestrator
export { NeuralEngineOrchestrator, getNeuralEngineOrchestrator } from './orchestrator';
