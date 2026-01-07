/**
 * RSOC Creative Neural Engine - Orchestrator
 *
 * Main orchestration layer that coordinates the 5-agent pipeline:
 *
 * ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
 * │ Global Scout│────▶│Asset Manager │────▶│ Angle Strategist│
 * └─────────────┘     └──────────────┘     └────────┬────────┘
 *                                                   │
 *                     ┌─────────────────────────────┘
 *                     ▼
 *              ┌───────────────┐     ┌─────────────────────┐
 *              │Visual Engineer│────▶│Compliance Assembler │
 *              └───────────────┘     └─────────────────────┘
 *
 * Design Principles:
 * - Fail-fast with graceful fallbacks
 * - Cache-first for cost optimization
 * - Parallel execution where possible
 * - Full telemetry for Data Flywheel
 */

import {
  NeuralEngineInput,
  NeuralEngineState,
  CreativePackage,
  AgentError,
  TimingMetrics,
  ModelUsage,
} from './types';
import { getGlobalScoutAgent } from './agents/global-scout.agent';
import { getAssetManagerAgent } from './agents/asset-manager.agent';
import { getAngleStrategistAgent } from './agents/angle-strategist.agent';
import { getVisualEngineerAgent } from './agents/visual-engineer.agent';
import { getComplianceAssembler } from './agents/compliance-assembler';

// ============================================================================
// CONSTANTS
// ============================================================================

const ORCHESTRATOR_NAME = 'NeuralEngineOrchestrator';

// ============================================================================
// ORCHESTRATOR
// ============================================================================

export class NeuralEngineOrchestrator {
  private globalScout = getGlobalScoutAgent();
  private assetManager = getAssetManagerAgent();
  private angleStrategist = getAngleStrategistAgent();
  private visualEngineer = getVisualEngineerAgent();
  private complianceAssembler = getComplianceAssembler();

  constructor() {
    console.log(`[${ORCHESTRATOR_NAME}] Initialized`);
  }

  /**
   * Execute the full creative generation pipeline
   */
  async execute(input: NeuralEngineInput): Promise<{
    success: boolean;
    data?: CreativePackage;
    state: NeuralEngineState;
    errors: AgentError[];
    warnings: string[];
  }> {
    const startTime = new Date();
    const cacheHits: string[] = [];
    const errors: AgentError[] = [];
    const warnings: string[] = [];
    const allModelUsage: ModelUsage[] = [];

    // Initialize state
    const state: NeuralEngineState = {
      input,
      cacheHits: [],
      errors: [],
      timing: {
        startedAt: startTime,
        agentTimings: {},
      },
    };

    console.log(`\n${'='.repeat(70)}`);
    console.log(`[${ORCHESTRATOR_NAME}] 🧠 NEURAL ENGINE PIPELINE STARTING`);
    console.log(`${'='.repeat(70)}`);
    console.log(`[${ORCHESTRATOR_NAME}] 📋 Input Configuration:`);
    console.log(`[${ORCHESTRATOR_NAME}]   - Offer: ${input.offer.name}`);
    console.log(`[${ORCHESTRATOR_NAME}]   - Vertical: ${input.offer.vertical}`);
    console.log(`[${ORCHESTRATOR_NAME}]   - Country: ${input.country}`);
    console.log(`[${ORCHESTRATOR_NAME}]   - Language: ${input.language}`);
    console.log(`[${ORCHESTRATOR_NAME}]   - Platform: ${input.platform}`);
    console.log(`${'='.repeat(70)}\n`);

    try {
      // ========================================================================
      // PHASE 1: Research & Retrieval (Parallel)
      // ========================================================================
      console.log(`[${ORCHESTRATOR_NAME}] 🔍 PHASE 1: Research & Retrieval (GlobalScout + AssetManager in parallel)`);

      const phase1Start = Date.now();

      // Execute Global Scout and Asset Manager in parallel
      const [scoutResult, assetResult] = await Promise.all([
        this.executeWithTiming('GlobalScout', state, () =>
          this.globalScout.execute(input)
        ),
        this.executeWithTiming('AssetManager', state, () =>
          this.assetManager.execute(input)
        ),
      ]);

      console.log(`[${ORCHESTRATOR_NAME}] ✅ Phase 1 completed in ${Date.now() - phase1Start}ms`);

      // Handle Global Scout result
      if (!scoutResult.success || !scoutResult.data) {
        if (scoutResult.error) errors.push(scoutResult.error);
        throw new Error('Global Scout failed: ' + (scoutResult.error?.error || 'Unknown error'));
      }

      if (scoutResult.fromCache) {
        cacheHits.push('GlobalScout');
        console.log(`[${ORCHESTRATOR_NAME}]   📦 GlobalScout: CACHE HIT`);
      } else {
        console.log(`[${ORCHESTRATOR_NAME}]   🔄 GlobalScout: Fresh research completed`);
      }

      state.culturalContext = scoutResult.data;
      console.log(`[${ORCHESTRATOR_NAME}]   🌍 Cultural Context: ${state.culturalContext.country}, Season: ${state.culturalContext.currentSeason}`);
      console.log(`[${ORCHESTRATOR_NAME}]   🎨 Visual Codes: ${state.culturalContext.visualCodes.slice(0, 3).join(', ')}...`);

      // Handle Asset Manager result
      if (!assetResult.success || !assetResult.data) {
        if (assetResult.error) errors.push(assetResult.error);
        throw new Error('Asset Manager failed: ' + (assetResult.error?.error || 'Unknown error'));
      }

      state.retrievedAssets = assetResult.data;
      console.log(`[${ORCHESTRATOR_NAME}]   📊 Assets Retrieved: ${state.retrievedAssets.topAds.length} top ads, ${state.retrievedAssets.blacklistedTerms.length} blacklisted terms`);

      // ========================================================================
      // PHASE 2: Strategy Development
      // ========================================================================
      console.log(`\n[${ORCHESTRATOR_NAME}] 🎯 PHASE 2: Strategy Development (AngleStrategist using Claude Sonnet)`);

      const phase2Start = Date.now();

      const strategyResult = await this.executeWithTiming('AngleStrategist', state, () =>
        this.angleStrategist.execute(input, state.culturalContext!, state.retrievedAssets!)
      );

      console.log(`[${ORCHESTRATOR_NAME}] ✅ Phase 2 completed in ${Date.now() - phase2Start}ms`);

      if (!strategyResult.success || !strategyResult.data) {
        if (strategyResult.error) errors.push(strategyResult.error);
        throw new Error('Angle Strategist failed: ' + (strategyResult.error?.error || 'Unknown error'));
      }

      if (strategyResult.fromCache) {
        cacheHits.push('AngleStrategist');
        console.log(`[${ORCHESTRATOR_NAME}]   📦 AngleStrategist: CACHE HIT`);
      } else {
        console.log(`[${ORCHESTRATOR_NAME}]   🔄 AngleStrategist: Fresh strategy developed`);
      }

      state.strategyBrief = strategyResult.data;
      console.log(`[${ORCHESTRATOR_NAME}]   🎯 Primary Angle: ${state.strategyBrief.primaryAngle}`);
      console.log(`[${ORCHESTRATOR_NAME}]   💡 Key Message: ${state.strategyBrief.keyMessage}`);
      console.log(`[${ORCHESTRATOR_NAME}]   🖼️  Visual Concept: ${state.strategyBrief.visualConcept}`);
      console.log(`[${ORCHESTRATOR_NAME}]   🎨 Visual Style: ${state.strategyBrief.visualStyle}`);

      // ========================================================================
      // PHASE 3: Visual Prompt Generation
      // ========================================================================
      console.log(`\n[${ORCHESTRATOR_NAME}] 🎨 PHASE 3: Visual Prompt Generation (VisualEngineer using Gemini Flash)`);

      const phase3Start = Date.now();

      const visualResult = await this.executeWithTiming('VisualEngineer', state, () =>
        this.visualEngineer.execute(input, state.strategyBrief!, state.culturalContext!)
      );

      console.log(`[${ORCHESTRATOR_NAME}] ✅ Phase 3 completed in ${Date.now() - phase3Start}ms`);

      if (!visualResult.success || !visualResult.data) {
        if (visualResult.error) errors.push(visualResult.error);
        throw new Error('Visual Engineer failed: ' + (visualResult.error?.error || 'Unknown error'));
      }

      if (visualResult.fromCache) {
        cacheHits.push('VisualEngineer');
        console.log(`[${ORCHESTRATOR_NAME}]   📦 VisualEngineer: CACHE HIT`);
      } else {
        console.log(`[${ORCHESTRATOR_NAME}]   🔄 VisualEngineer: Fresh prompts generated`);
      }

      state.visualPrompts = visualResult.data;
      console.log(`[${ORCHESTRATOR_NAME}]   📝 Generated ${state.visualPrompts.length} image prompts`);
      state.visualPrompts.forEach((vp, idx) => {
        const truncatedPrompt = vp.prompt.length > 100 ? vp.prompt.substring(0, 100) + '...' : vp.prompt;
        console.log(`[${ORCHESTRATOR_NAME}]   📷 Prompt ${idx + 1} (${vp.aspectRatio}): "${truncatedPrompt}"`);
      });

      // ========================================================================
      // PHASE 4: Creative Assembly
      // ========================================================================
      console.log(`\n[${ORCHESTRATOR_NAME}] 🏭 PHASE 4: Creative Assembly (ComplianceAssembler using Imagen 3)`);

      const phase4Start = Date.now();

      const assemblyResult = await this.executeWithTiming('ComplianceAssembler', state, () =>
        this.complianceAssembler.execute(
          input,
          state.strategyBrief!,
          state.visualPrompts!,
          state.retrievedAssets!
        )
      );

      console.log(`[${ORCHESTRATOR_NAME}] ✅ Phase 4 completed in ${Date.now() - phase4Start}ms`);

      if (!assemblyResult.success || !assemblyResult.data) {
        if (assemblyResult.error) errors.push(assemblyResult.error);
        throw new Error('Compliance Assembler failed: ' + (assemblyResult.error?.error || 'Unknown error'));
      }

      // Capture any warnings (e.g., quota exceeded)
      if (assemblyResult.warning) {
        warnings.push(assemblyResult.warning);
        console.log(`[${ORCHESTRATOR_NAME}]   ⚠️ Warning: ${assemblyResult.warning}`);
      }

      // Collect model usage
      allModelUsage.push(...assemblyResult.modelUsage);

      state.creativePackage = assemblyResult.data;
      console.log(`[${ORCHESTRATOR_NAME}]   🖼️  Images Generated: ${state.creativePackage?.visuals?.images?.length || 0}`);
      console.log(`[${ORCHESTRATOR_NAME}]   📏 Assembled Creatives: ${state.creativePackage?.visuals?.assembled?.length || 0}`);

      // ========================================================================
      // FINALIZE
      // ========================================================================
      const endTime = new Date();
      state.timing.completedAt = endTime;
      state.timing.totalMs = endTime.getTime() - startTime.getTime();
      state.cacheHits = cacheHits;
      state.errors = errors;

      // Update creative package metadata
      if (state.creativePackage) {
        state.creativePackage.metadata.cacheHits = cacheHits;
      }

      console.log(`\n${'='.repeat(70)}`);
      console.log(`[${ORCHESTRATOR_NAME}] 🎉 NEURAL ENGINE PIPELINE COMPLETED SUCCESSFULLY`);
      console.log(`${'='.repeat(70)}`);
      console.log(`[${ORCHESTRATOR_NAME}] 📊 Summary:`);
      console.log(`[${ORCHESTRATOR_NAME}]   ⏱️  Total Time: ${state.timing.totalMs}ms`);
      console.log(`[${ORCHESTRATOR_NAME}]   📦 Cache Hits: ${cacheHits.length} (${cacheHits.join(', ') || 'none'})`);
      console.log(`[${ORCHESTRATOR_NAME}]   🖼️  Images Generated: ${state.creativePackage?.visuals?.images?.length || 0}`);
      console.log(`[${ORCHESTRATOR_NAME}]   ⚠️  Warnings: ${warnings.length}`);
      console.log(`[${ORCHESTRATOR_NAME}]   ❌ Errors: ${errors.length}`);
      console.log(`${'='.repeat(70)}\n`);

      return {
        success: true,
        data: state.creativePackage,
        state,
        errors,
        warnings,
      };
    } catch (error: any) {
      console.error(`\n${'='.repeat(70)}`);
      console.error(`[${ORCHESTRATOR_NAME}] ❌ NEURAL ENGINE PIPELINE FAILED`);
      console.error(`${'='.repeat(70)}`);
      console.error(`[${ORCHESTRATOR_NAME}] Error: ${error.message}`);

      const endTime = new Date();
      state.timing.completedAt = endTime;
      state.timing.totalMs = endTime.getTime() - startTime.getTime();
      state.cacheHits = cacheHits;
      state.errors = errors;

      return {
        success: false,
        state,
        errors,
        warnings,
      };
    }
  }

  /**
   * Execute an agent with timing tracking
   */
  private async executeWithTiming<T>(
    agentName: string,
    state: NeuralEngineState,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = new Date();
    state.timing.agentTimings[agentName] = { startedAt: startTime };

    try {
      const result = await fn();

      const endTime = new Date();
      state.timing.agentTimings[agentName].completedAt = endTime;
      state.timing.agentTimings[agentName].durationMs = endTime.getTime() - startTime.getTime();

      return result;
    } catch (error) {
      const endTime = new Date();
      state.timing.agentTimings[agentName].completedAt = endTime;
      state.timing.agentTimings[agentName].durationMs = endTime.getTime() - startTime.getTime();

      throw error;
    }
  }

  /**
   * Get a quick estimate of cost for a generation
   */
  estimateCost(input: NeuralEngineInput): {
    llmCost: number;
    imageCost: number;
    totalCost: number;
    withCache: number;
  } {
    // Base costs per generation (from model-configs.ts analysis)
    const llmCost = 0.044; // $0.044 for all LLM calls
    const imageCost = 0.02 * 4; // $0.02 per image × 4 images

    const totalCost = llmCost + imageCost;
    const cacheHitRate = 0.6; // 60% expected cache hit rate

    return {
      llmCost,
      imageCost,
      totalCost,
      withCache: totalCost * (1 - cacheHitRate * 0.5), // ~$0.088 with caching
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let orchestratorInstance: NeuralEngineOrchestrator | null = null;

export function getNeuralEngineOrchestrator(): NeuralEngineOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new NeuralEngineOrchestrator();
  }
  return orchestratorInstance;
}
