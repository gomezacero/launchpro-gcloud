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
  }> {
    const startTime = new Date();
    const cacheHits: string[] = [];
    const errors: AgentError[] = [];
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

    console.log(`[${ORCHESTRATOR_NAME}] Starting pipeline for ${input.offer.name} in ${input.country}`);

    try {
      // ========================================================================
      // PHASE 1: Research & Retrieval (Parallel)
      // ========================================================================
      console.log(`[${ORCHESTRATOR_NAME}] Phase 1: Research & Retrieval`);

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

      console.log(`[${ORCHESTRATOR_NAME}] Phase 1 completed in ${Date.now() - phase1Start}ms`);

      // Handle Global Scout result
      if (!scoutResult.success || !scoutResult.data) {
        if (scoutResult.error) errors.push(scoutResult.error);
        throw new Error('Global Scout failed: ' + (scoutResult.error?.error || 'Unknown error'));
      }

      if (scoutResult.fromCache) {
        cacheHits.push('GlobalScout');
      }

      state.culturalContext = scoutResult.data;

      // Handle Asset Manager result
      if (!assetResult.success || !assetResult.data) {
        if (assetResult.error) errors.push(assetResult.error);
        throw new Error('Asset Manager failed: ' + (assetResult.error?.error || 'Unknown error'));
      }

      state.retrievedAssets = assetResult.data;

      // ========================================================================
      // PHASE 2: Strategy Development
      // ========================================================================
      console.log(`[${ORCHESTRATOR_NAME}] Phase 2: Strategy Development`);

      const phase2Start = Date.now();

      const strategyResult = await this.executeWithTiming('AngleStrategist', state, () =>
        this.angleStrategist.execute(input, state.culturalContext!, state.retrievedAssets!)
      );

      console.log(`[${ORCHESTRATOR_NAME}] Phase 2 completed in ${Date.now() - phase2Start}ms`);

      if (!strategyResult.success || !strategyResult.data) {
        if (strategyResult.error) errors.push(strategyResult.error);
        throw new Error('Angle Strategist failed: ' + (strategyResult.error?.error || 'Unknown error'));
      }

      if (strategyResult.fromCache) {
        cacheHits.push('AngleStrategist');
      }

      state.strategyBrief = strategyResult.data;

      // ========================================================================
      // PHASE 3: Visual Prompt Generation
      // ========================================================================
      console.log(`[${ORCHESTRATOR_NAME}] Phase 3: Visual Prompt Generation`);

      const phase3Start = Date.now();

      const visualResult = await this.executeWithTiming('VisualEngineer', state, () =>
        this.visualEngineer.execute(input, state.strategyBrief!, state.culturalContext!)
      );

      console.log(`[${ORCHESTRATOR_NAME}] Phase 3 completed in ${Date.now() - phase3Start}ms`);

      if (!visualResult.success || !visualResult.data) {
        if (visualResult.error) errors.push(visualResult.error);
        throw new Error('Visual Engineer failed: ' + (visualResult.error?.error || 'Unknown error'));
      }

      if (visualResult.fromCache) {
        cacheHits.push('VisualEngineer');
      }

      state.visualPrompts = visualResult.data;

      // ========================================================================
      // PHASE 4: Creative Assembly
      // ========================================================================
      console.log(`[${ORCHESTRATOR_NAME}] Phase 4: Creative Assembly`);

      const phase4Start = Date.now();

      const assemblyResult = await this.executeWithTiming('ComplianceAssembler', state, () =>
        this.complianceAssembler.execute(
          input,
          state.strategyBrief!,
          state.visualPrompts!,
          state.retrievedAssets!
        )
      );

      console.log(`[${ORCHESTRATOR_NAME}] Phase 4 completed in ${Date.now() - phase4Start}ms`);

      if (!assemblyResult.success || !assemblyResult.data) {
        if (assemblyResult.error) errors.push(assemblyResult.error);
        throw new Error('Compliance Assembler failed: ' + (assemblyResult.error?.error || 'Unknown error'));
      }

      // Collect model usage
      allModelUsage.push(...assemblyResult.modelUsage);

      state.creativePackage = assemblyResult.data;

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

      console.log(`[${ORCHESTRATOR_NAME}] Pipeline completed successfully in ${state.timing.totalMs}ms`, {
        cacheHits: cacheHits.length,
        errors: errors.length,
        imagesGenerated: state.creativePackage?.visuals?.images?.length || 0,
      });

      return {
        success: true,
        data: state.creativePackage,
        state,
        errors,
      };
    } catch (error: any) {
      console.error(`[${ORCHESTRATOR_NAME}] Pipeline failed:`, error.message);

      const endTime = new Date();
      state.timing.completedAt = endTime;
      state.timing.totalMs = endTime.getTime() - startTime.getTime();
      state.cacheHits = cacheHits;
      state.errors = errors;

      return {
        success: false,
        state,
        errors,
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
