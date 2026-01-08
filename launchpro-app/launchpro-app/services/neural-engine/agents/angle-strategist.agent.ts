/**
 * RSOC Creative Neural Engine - Angle Strategist Agent
 *
 * Role: Creative Director & Consumer Psychology Strategist
 * Model: Claude Sonnet 3.5 (requires maximum reasoning capability)
 *
 * This agent crosses cultural data from Global Scout with assets from Asset Manager
 * to define the optimal psychological approach for the campaign.
 *
 * Key Capabilities:
 * - 4 psychological angles per campaign (Urgency, Curiosity, Social Proof, Authority, etc.)
 * - Copy strategy with key message and emotional hook
 * - Visual direction and platform-specific adaptations
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  StrategyBrief,
  CulturalContext,
  RetrievedAssets,
  NeuralEngineInput,
  CommunicationAngle,
  PlatformAdaptation,
  AgentError,
} from '../types';
import { ANGLE_STRATEGIST_CONFIG } from '../config/model-configs';
import { getSemanticCacheService } from '../cache/semantic-cache.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_NAME = 'AngleStrategist';

// ============================================================================
// ANGLE STRATEGIST AGENT
// ============================================================================

export class AngleStrategistAgent {
  private anthropic: Anthropic;
  private cacheService = getSemanticCacheService();

  constructor() {
    // Use process.env directly to avoid module caching issues
    const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
    this.anthropic = new Anthropic({
      apiKey: anthropicKey,
    });

    if (!anthropicKey) {
      console.warn('[AngleStrategist] ⚠️ WARNING: ANTHROPIC_API_KEY not found');
    }
  }

  /**
   * Execute the strategy development
   */
  async execute(
    input: NeuralEngineInput,
    culturalContext: CulturalContext,
    retrievedAssets: RetrievedAssets
  ): Promise<{
    success: boolean;
    data?: StrategyBrief;
    error?: AgentError;
    fromCache: boolean;
  }> {
    const startTime = Date.now();

    console.log(`[${AGENT_NAME}] Developing strategy for ${input.offer.name}`);

    try {
      // Check cache first
      if (input.useCache !== false) {
        const cached = await this.checkCache(input, culturalContext);
        if (cached) {
          console.log(`[${AGENT_NAME}] Cache hit! Returning cached strategy.`);
          return { success: true, data: cached, fromCache: true };
        }
      }

      // Generate strategy using Claude Sonnet
      const strategyBrief = await this.developStrategy(input, culturalContext, retrievedAssets);

      // Cache the result
      if (input.useCache !== false) {
        await this.cacheResult(input, strategyBrief);
      }

      const duration = Date.now() - startTime;
      console.log(`[${AGENT_NAME}] Strategy developed in ${duration}ms`);

      return { success: true, data: strategyBrief, fromCache: false };
    } catch (error: any) {
      console.error(`[${AGENT_NAME}] Error:`, error.message);

      return {
        success: false,
        error: {
          agent: AGENT_NAME,
          error: error.message,
          code: 'MODEL_ERROR',
          timestamp: new Date(),
          recoverable: true,
        },
        fromCache: false,
      };
    }
  }

  /**
   * Check cache for existing strategy
   */
  private async checkCache(
    input: NeuralEngineInput,
    culturalContext: CulturalContext
  ): Promise<StrategyBrief | null> {
    const cacheKey = this.buildCacheKey(input);

    try {
      const cached = await this.cacheService.getAngles(cacheKey);
      if (cached) {
        return cached as StrategyBrief;
      }
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache check failed:`, error);
    }

    return null;
  }

  /**
   * Cache the strategy result
   */
  private async cacheResult(input: NeuralEngineInput, data: StrategyBrief): Promise<void> {
    const cacheKey = this.buildCacheKey(input);

    try {
      await this.cacheService.setAngles(cacheKey, data);
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache write failed:`, error);
    }
  }

  /**
   * Build cache key
   */
  private buildCacheKey(input: NeuralEngineInput): string {
    return `${input.offer.id}_${input.country}_${input.platform}`;
  }

  /**
   * Develop the strategy using Claude Sonnet
   */
  private async developStrategy(
    input: NeuralEngineInput,
    culturalContext: CulturalContext,
    retrievedAssets: RetrievedAssets
  ): Promise<StrategyBrief> {
    const prompt = this.buildStrategyPrompt(input, culturalContext, retrievedAssets);

    console.log(`[${AGENT_NAME}] Calling Claude Sonnet for strategy development...`);

    const response = await this.anthropic.messages.create({
      model: ANGLE_STRATEGIST_CONFIG.model.model,
      max_tokens: ANGLE_STRATEGIST_CONFIG.model.maxTokens,
      temperature: ANGLE_STRATEGIST_CONFIG.model.temperature,
      system: this.getSystemPrompt(),
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract text response
    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse the JSON response
    const strategyBrief = this.parseStrategyResponse(textBlock.text, input);

    return strategyBrief;
  }

  /**
   * Get system prompt for the strategist
   */
  private getSystemPrompt(): string {
    return `You are a world-class Creative Director and Consumer Psychology expert specializing in performance marketing for search arbitrage campaigns.

Your role is to develop advertising strategies that are:
1. Culturally authentic to the target market
2. Psychologically compelling
3. Compliant with platform policies
4. Optimized for high CTR and conversion

You have deep expertise in:
- Consumer psychology and behavioral economics
- Cross-cultural marketing
- Direct response advertising
- Platform-specific best practices (Meta, TikTok)

You never use clickbait or deceptive tactics. Your strategies are honest, compelling, and effective.

Always respond with valid JSON matching the requested schema.`;
  }

  /**
   * Build the strategy development prompt
   */
  private buildStrategyPrompt(
    input: NeuralEngineInput,
    culturalContext: CulturalContext,
    retrievedAssets: RetrievedAssets
  ): string {
    return `Develop an advertising strategy for the following campaign:

## CAMPAIGN CONTEXT
- Offer: ${input.offer.name}
- Vertical: ${input.offer.vertical}
- Description: ${input.offer.description || 'N/A'}
- Country: ${culturalContext.country}
- Language: ${input.language}
- Platform: ${input.platform}

## CULTURAL INSIGHTS (from market research)
- Season: ${culturalContext.currentSeason}
- Visual Codes: ${culturalContext.visualCodes.join(', ') || 'Standard professional imagery'}
- Color Preferences: ${culturalContext.colorPreferences.join(', ') || 'Trust colors (blue, green)'}
- Cultural Taboos: ${culturalContext.taboos.join(', ') || 'None identified'}
- Current Trends: ${culturalContext.currentTrends.join(', ') || 'General interest'}
- Target Demo: ${culturalContext.targetDemographic.ageRange}, ${culturalContext.targetDemographic.gender}
- Interests: ${culturalContext.targetDemographic.interests.join(', ') || 'General'}

## TOP PERFORMING REFERENCES
${this.formatTopAds(retrievedAssets.topAds)}

## BLACKLISTED TERMS (DO NOT USE)
${retrievedAssets.blacklistedTerms.join(', ')}

## REQUESTED ANGLE (if specified)
${input.communicationAngle || 'Choose the most effective angle based on context'}

## YOUR TASK
Create a complete advertising strategy with:
1. Primary psychological angle (and optional secondary)
2. Copy strategy with key message and emotional hook
3. Visual concept and style direction
4. Platform-specific copy adaptations

RESPOND IN JSON FORMAT:
{
  "primaryAngle": "urgency|curiosity|social_proof|authority|fear_of_missing_out|aspiration|emotional|rational",
  "secondaryAngle": "optional secondary angle",
  "copyMaster": "The core value proposition in 2-3 sentences",
  "keyMessage": "The single most important takeaway",
  "emotionalHook": "The emotional trigger that grabs attention",
  "visualConcept": "Description of the visual approach",
  "visualStyle": "ugc|professional|native|editorial",
  "colorPalette": ["color1", "color2", "color3"],
  "platformAdaptations": {
    "${input.platform.toLowerCase()}": {
      "headline": "25-40 character headline",
      "primaryText": "90-125 character primary text",
      "description": "25-30 character description",
      "callToAction": "CTA button text"
    }
  }
}`;
  }

  /**
   * Format top ads for the prompt
   */
  private formatTopAds(topAds: RetrievedAssets['topAds']): string {
    if (topAds.length === 0) {
      return 'No historical references available. Use best practices for the vertical.';
    }

    return topAds
      .slice(0, 3)
      .map(
        (ad, i) => `
Reference ${i + 1}:
- Headline: ${ad.headline}
- Primary Text: ${ad.primaryText}
- ROAS: ${ad.roas > 0 ? ad.roas.toFixed(2) : 'N/A'}
- CTR: ${ad.ctr > 0 ? (ad.ctr * 100).toFixed(2) + '%' : 'N/A'}`
      )
      .join('\n');
  }

  /**
   * Parse the strategy response into StrategyBrief
   */
  private parseStrategyResponse(text: string, input: NeuralEngineInput): StrategyBrief {
    let parsed: any;

    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn(`[${AGENT_NAME}] Failed to parse JSON, using defaults`);
      parsed = this.getDefaultStrategy(input);
    }

    // Validate and transform
    const platformKey = input.platform.toLowerCase();

    return {
      primaryAngle: this.validateAngle(parsed.primaryAngle),
      secondaryAngle: parsed.secondaryAngle ? this.validateAngle(parsed.secondaryAngle) : undefined,
      copyMaster: parsed.copyMaster || `Discover the best ${input.offer.vertical} solutions.`,
      keyMessage: parsed.keyMessage || `Quality ${input.offer.vertical} for you.`,
      emotionalHook: parsed.emotionalHook || 'Start your journey today.',
      visualConcept: parsed.visualConcept || 'Professional, authentic imagery',
      visualStyle: this.validateVisualStyle(parsed.visualStyle),
      colorPalette: Array.isArray(parsed.colorPalette) ? parsed.colorPalette : ['#0066CC', '#FFFFFF'],
      platformAdaptations: {
        [platformKey]: this.validatePlatformAdaptation(
          parsed.platformAdaptations?.[platformKey],
          input
        ),
      },
    };
  }

  /**
   * Validate communication angle
   */
  private validateAngle(angle: string): CommunicationAngle {
    const validAngles: CommunicationAngle[] = [
      'emotional',
      'rational',
      'urgency',
      'social_proof',
      'curiosity',
      'authority',
      'fear_of_missing_out',
      'aspiration',
    ];

    if (validAngles.includes(angle as CommunicationAngle)) {
      return angle as CommunicationAngle;
    }

    return 'rational';
  }

  /**
   * Validate visual style
   */
  private validateVisualStyle(style: string): 'ugc' | 'professional' | 'native' | 'editorial' {
    const validStyles = ['ugc', 'professional', 'native', 'editorial'];

    if (validStyles.includes(style)) {
      return style as 'ugc' | 'professional' | 'native' | 'editorial';
    }

    return 'native';
  }

  /**
   * Validate platform adaptation
   */
  private validatePlatformAdaptation(
    adaptation: any,
    input: NeuralEngineInput
  ): PlatformAdaptation {
    return {
      headline: adaptation?.headline || `Compare ${input.offer.vertical}`,
      primaryText: adaptation?.primaryText || `Find the best ${input.offer.name} options today.`,
      description: adaptation?.description || 'Learn more',
      callToAction: adaptation?.callToAction || 'Learn More',
    };
  }

  /**
   * Get default strategy when parsing fails
   */
  private getDefaultStrategy(input: NeuralEngineInput): any {
    const platformKey = input.platform.toLowerCase();

    return {
      primaryAngle: 'rational',
      copyMaster: `Discover quality ${input.offer.vertical} solutions tailored for you.`,
      keyMessage: `The smart choice for ${input.offer.vertical}`,
      emotionalHook: 'Start making smarter decisions today.',
      visualConcept: 'Clean, professional imagery with authentic people',
      visualStyle: 'native',
      colorPalette: ['#0066CC', '#4CAF50', '#FFFFFF'],
      platformAdaptations: {
        [platformKey]: {
          headline: `Compare ${input.offer.vertical} Options`,
          primaryText: `Find the best ${input.offer.name} solutions. Compare rates and save.`,
          description: 'See your options',
          callToAction: 'Learn More',
        },
      },
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let angleStrategistInstance: AngleStrategistAgent | null = null;

export function getAngleStrategistAgent(): AngleStrategistAgent {
  if (!angleStrategistInstance) {
    angleStrategistInstance = new AngleStrategistAgent();
  }
  return angleStrategistInstance;
}
