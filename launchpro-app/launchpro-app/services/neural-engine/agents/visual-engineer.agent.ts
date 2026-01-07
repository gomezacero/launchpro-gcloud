/**
 * RSOC Creative Neural Engine - Visual Engineer Agent
 *
 * Role: Concept-to-Image Prompt Translator
 * Model: Gemini 2.0 Flash (fast, structured output)
 *
 * This agent converts abstract strategy concepts into technical prompts
 * optimized for the image generation model (Imagen 3).
 *
 * Key Capabilities:
 * - Force "Native/Amateur" UGC aesthetic
 * - Aggressive negative prompting for brand safety
 * - Platform-specific aspect ratio handling
 * - Multiple variations per concept
 */

import { GoogleGenAI } from '@google/genai';
import {
  VisualPrompt,
  StrategyBrief,
  CulturalContext,
  NeuralEngineInput,
  AgentError,
} from '../types';
import { VISUAL_ENGINEER_CONFIG } from '../config/model-configs';
import { getSemanticCacheService } from '../cache/semantic-cache.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_NAME = 'VisualEngineer';
const VARIATIONS_PER_CONCEPT = 2;

// Platform-specific aspect ratios
const PLATFORM_ASPECTS: Record<string, { ratio: '1:1' | '16:9' | '9:16' | '4:3'; width: number; height: number }[]> = {
  META: [
    { ratio: '1:1', width: 1080, height: 1080 },
    { ratio: '4:3', width: 1200, height: 900 },
  ],
  TIKTOK: [
    { ratio: '9:16', width: 1080, height: 1920 },
    { ratio: '1:1', width: 1080, height: 1080 },
  ],
};

// ============================================================================
// VERTICAL-SPECIFIC VISUAL REQUIREMENTS
// Forces the AI to include product-relevant visuals
// ============================================================================
const VERTICAL_VISUAL_REQUIREMENTS: Record<string, { required: string; examples: string }> = {
  'Car Loans': {
    required: 'A CAR OR VEHICLE must be prominently featured in the image',
    examples: 'car dealership, person with new car, car keys handover, family in car, driving scene',
  },
  'Auto Loans': {
    required: 'A CAR OR VEHICLE must be prominently featured in the image',
    examples: 'car dealership, person with new car, car keys handover, family in car, driving scene',
  },
  'Personal Loans': {
    required: 'FINANCIAL or MONEY-RELATED elements should be visible',
    examples: 'person reviewing finances, cash/money imagery, banking context, financial freedom moment',
  },
  'Credit Cards': {
    required: 'CREDIT CARD or PAYMENT scene must be included',
    examples: 'person with credit card, shopping scene, payment at store, card rewards',
  },
  'Insurance': {
    required: 'PROTECTION or SECURITY theme must be visible',
    examples: 'family protection, home security, car safety, health/medical context, peace of mind',
  },
  'Home Insurance': {
    required: 'A HOME or HOUSE must be prominently featured',
    examples: 'family home exterior, home protection, house with family, safe home environment',
  },
  'Auto Insurance': {
    required: 'A CAR and PROTECTION theme must be featured',
    examples: 'car safety, protected vehicle, driver confidence, accident prevention',
  },
  'Life Insurance': {
    required: 'FAMILY PROTECTION theme must be central',
    examples: 'family together, generational care, parent with children, security for loved ones',
  },
  'Solar': {
    required: 'SOLAR PANELS or RENEWABLE ENERGY must be visible',
    examples: 'solar panels on roof, home with solar installation, clean energy, sun/solar imagery',
  },
  'Medicare': {
    required: 'SENIORS and HEALTHCARE context must be shown',
    examples: 'happy seniors, healthcare setting, doctor consultation, healthy elderly lifestyle',
  },
  'Health Insurance': {
    required: 'HEALTHCARE or MEDICAL theme must be present',
    examples: 'doctor visit, health checkup, medical care, healthy family',
  },
  'Debt Relief': {
    required: 'FINANCIAL FREEDOM or STRESS RELIEF must be the theme',
    examples: 'person relieved from stress, breaking free, financial burden lifted, peace of mind',
  },
  'Tax Relief': {
    required: 'TAX or FINANCIAL RELIEF theme must be shown',
    examples: 'tax documents, person relieved, IRS context, financial paperwork resolution',
  },
  'Education': {
    required: 'LEARNING or EDUCATION setting must be featured',
    examples: 'student studying, graduation, online learning, classroom, books/laptop',
  },
  'Home Services': {
    required: 'HOME IMPROVEMENT or SERVICE context must be visible',
    examples: 'home repair, contractor working, improved home, renovation',
  },
};

// Standard negative prompts for brand safety
const STANDARD_NEGATIVE_PROMPTS = [
  'text',
  'watermark',
  'logo',
  'brand name',
  'typography',
  'letters',
  'words',
  'signature',
  'copyright',
  'nudity',
  'violence',
  'blood',
  'weapons',
  'drugs',
  'alcohol',
  'tobacco',
  'gambling',
  'political symbols',
  'religious symbols',
  'celebrities',
  'children in distress',
  'deformed faces',
  'extra limbs',
  'blurry',
  'low quality',
  'overexposed',
  'underexposed',
];

// ============================================================================
// VISUAL ENGINEER AGENT
// ============================================================================

export class VisualEngineerAgent {
  private gemini: GoogleGenAI;
  private cacheService = getSemanticCacheService();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

    if (!apiKey) {
      console.warn(`[${AGENT_NAME}] GEMINI_API_KEY not set. Agent will fail.`);
    }

    this.gemini = new GoogleGenAI({ apiKey: apiKey || '' });
  }

  /**
   * Execute prompt generation
   */
  async execute(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    culturalContext: CulturalContext
  ): Promise<{
    success: boolean;
    data?: VisualPrompt[];
    error?: AgentError;
    fromCache: boolean;
  }> {
    const startTime = Date.now();

    console.log(`[${AGENT_NAME}] Generating visual prompts for ${input.offer.name}`);

    try {
      // Check cache first
      if (input.useCache !== false) {
        const cached = await this.checkCache(strategyBrief);
        if (cached) {
          console.log(`[${AGENT_NAME}] Cache hit! Returning cached prompts.`);
          return { success: true, data: cached, fromCache: true };
        }
      }

      // Generate prompts using Gemini Flash
      const visualPrompts = await this.generatePrompts(input, strategyBrief, culturalContext);

      // Cache the result
      if (input.useCache !== false) {
        await this.cacheResult(strategyBrief, visualPrompts);
      }

      const duration = Date.now() - startTime;
      console.log(`[${AGENT_NAME}] Generated ${visualPrompts.length} prompts in ${duration}ms`);

      return { success: true, data: visualPrompts, fromCache: false };
    } catch (error: any) {
      console.error(`[${AGENT_NAME}] Error:`, error.message);

      // Fallback to template-based prompts
      const fallbackPrompts = this.generateFallbackPrompts(input, strategyBrief);

      return {
        success: true,
        data: fallbackPrompts,
        error: {
          agent: AGENT_NAME,
          error: error.message,
          code: 'MODEL_ERROR',
          timestamp: new Date(),
          recoverable: true,
          fallbackUsed: 'template-based prompts',
        },
        fromCache: false,
      };
    }
  }

  /**
   * Check cache for existing prompts
   */
  private async checkCache(strategyBrief: StrategyBrief): Promise<VisualPrompt[] | null> {
    const cacheKey = this.buildCacheKey(strategyBrief);

    try {
      const cached = await this.cacheService.getPrompts(cacheKey);
      if (cached) {
        return cached as VisualPrompt[];
      }
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache check failed:`, error);
    }

    return null;
  }

  /**
   * Cache the prompts
   */
  private async cacheResult(strategyBrief: StrategyBrief, prompts: VisualPrompt[]): Promise<void> {
    const cacheKey = this.buildCacheKey(strategyBrief);

    try {
      await this.cacheService.setPrompts(cacheKey, prompts);
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache write failed:`, error);
    }
  }

  /**
   * Build cache key from strategy brief
   */
  private buildCacheKey(strategyBrief: StrategyBrief): string {
    // Create a hash of the visual concept
    const conceptHash = this.hashString(
      `${strategyBrief.visualConcept}_${strategyBrief.visualStyle}_${strategyBrief.primaryAngle}`
    );
    return conceptHash;
  }

  /**
   * Simple string hash
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generate prompts using Gemini Flash
   */
  private async generatePrompts(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    culturalContext: CulturalContext
  ): Promise<VisualPrompt[]> {
    const prompt = this.buildPromptGenerationPrompt(input, strategyBrief, culturalContext);

    console.log(`[${AGENT_NAME}] Calling Gemini Flash for prompt generation...`);

    const response = await this.gemini.models.generateContent({
      model: VISUAL_ENGINEER_CONFIG.model.model,
      contents: prompt,
      config: {
        temperature: VISUAL_ENGINEER_CONFIG.model.temperature,
        maxOutputTokens: VISUAL_ENGINEER_CONFIG.model.maxTokens,
      },
    });

    const text = response.text || '';

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Parse the prompts
    const prompts = this.parsePromptResponse(text, input, strategyBrief);

    return prompts;
  }

  /**
   * Build the prompt generation prompt
   */
  private buildPromptGenerationPrompt(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    culturalContext: CulturalContext
  ): string {
    const aspects = PLATFORM_ASPECTS[input.platform] || PLATFORM_ASPECTS.META;
    const verticalReqs = this.getVerticalRequirements(input.offer.vertical);

    console.log(`[${AGENT_NAME}] 📋 Building prompt for vertical: "${input.offer.vertical}"`);
    console.log(`[${AGENT_NAME}] 📋 Visual requirements: ${verticalReqs.required}`);

    return `You are an expert prompt engineer for AI image generation (Imagen 3).

## TASK
Generate image generation prompts for the following advertising campaign.

## CAMPAIGN CONTEXT
- Platform: ${input.platform}
- Country: ${culturalContext.country}
- Vertical: ${input.offer.vertical}
- Visual Style: ${strategyBrief.visualStyle}
- Visual Concept: ${strategyBrief.visualConcept}
- Color Palette: ${strategyBrief.colorPalette.join(', ')}
- Psychological Angle: ${strategyBrief.primaryAngle}

## ⚠️ CRITICAL VISUAL REQUIREMENT FOR "${input.offer.vertical.toUpperCase()}" ⚠️
${verticalReqs.required}
Example scenes: ${verticalReqs.examples}

THIS IS MANDATORY - Every generated prompt MUST include the product/service visual element described above.
An ad for "${input.offer.vertical}" without the relevant product visual will be rejected.

## CULTURAL CODES TO INCORPORATE
${culturalContext.visualCodes.join(', ') || 'Professional, authentic imagery'}

## STYLE REQUIREMENTS
- Style: ${this.getStyleDescription(strategyBrief.visualStyle)}
- CRITICAL: The image must look NATIVE to ${input.platform}. It should NOT look like a stock photo.
- CRITICAL: NO text, logos, or watermarks in the image. Text will be added programmatically later.
- Use natural, authentic settings and real-looking people
- Lighting should be natural, slightly imperfect (like a real photo)

## ASPECT RATIOS NEEDED
${aspects.map((a) => `- ${a.ratio} (${a.width}x${a.height})`).join('\n')}

## OUTPUT FORMAT
Generate ${VARIATIONS_PER_CONCEPT} variations for each aspect ratio. Respond in JSON:

{
  "prompts": [
    {
      "prompt": "Detailed image generation prompt that INCLUDES the required visual element...",
      "aspectRatio": "1:1",
      "style": "photorealistic|ugc",
      "variation": 1
    }
  ]
}

IMPORTANT RULES FOR PROMPTS:
1. ALWAYS include the required product/visual element for the vertical (${verticalReqs.required})
2. Be specific about camera angle, lighting, and composition
3. Include the person's apparent demographics when relevant
4. Describe the setting authentically for ${culturalContext.country}
5. Never mention text, logos, or overlays
6. Focus on emotion and action, not static poses`;
  }

  /**
   * Get vertical-specific visual requirements
   */
  private getVerticalRequirements(vertical: string): { required: string; examples: string } {
    // Try exact match first
    if (VERTICAL_VISUAL_REQUIREMENTS[vertical]) {
      return VERTICAL_VISUAL_REQUIREMENTS[vertical];
    }

    // Try case-insensitive match
    const lowerVertical = vertical.toLowerCase();
    for (const [key, value] of Object.entries(VERTICAL_VISUAL_REQUIREMENTS)) {
      if (key.toLowerCase() === lowerVertical || lowerVertical.includes(key.toLowerCase())) {
        return value;
      }
    }

    // Default fallback
    console.warn(`[${AGENT_NAME}] ⚠️ No specific visual requirements for vertical: "${vertical}". Using generic.`);
    return {
      required: `The image must clearly relate to ${vertical} and show relevant context`,
      examples: 'relevant product, service in action, satisfied customer with product',
    };
  }

  /**
   * Get style description for prompt
   */
  private getStyleDescription(style: string): string {
    const descriptions: Record<string, string> = {
      ugc: 'User-generated content style. Looks like it was shot on a smartphone by a real person. Slightly imperfect framing, natural lighting, casual setting.',
      professional: 'Clean, professional photography. Well-lit, properly composed, but still authentic and relatable.',
      native: 'Platform-native style. Looks like organic content that would appear in feeds. Authentic, engaging, scroll-stopping.',
      editorial: 'Magazine-quality photography. Polished but not overly staged. Lifestyle editorial feel.',
    };

    return descriptions[style] || descriptions.native;
  }

  /**
   * Parse the prompt response
   */
  private parsePromptResponse(
    text: string,
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief
  ): VisualPrompt[] {
    let parsed: any;

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Failed to parse JSON, using fallback`);
      return this.generateFallbackPrompts(input, strategyBrief);
    }

    const aspects = PLATFORM_ASPECTS[input.platform] || PLATFORM_ASPECTS.META;

    // Transform parsed prompts to VisualPrompt format
    const visualPrompts: VisualPrompt[] = (parsed.prompts || []).map((p: any, i: number) => ({
      prompt: p.prompt || this.getDefaultPrompt(input, strategyBrief),
      negativePrompt: this.buildNegativePrompt(strategyBrief),
      aspectRatio: this.validateAspectRatio(p.aspectRatio),
      style: p.style === 'ugc' ? 'ugc' : 'photorealistic',
      safetyLevel: 'strict' as const,
      conceptId: `concept-${strategyBrief.primaryAngle}`,
      variation: p.variation || i + 1,
    }));

    // Ensure we have at least one prompt per aspect ratio
    for (const aspect of aspects) {
      const hasAspect = visualPrompts.some((p) => p.aspectRatio === aspect.ratio);
      if (!hasAspect) {
        visualPrompts.push({
          prompt: this.getDefaultPrompt(input, strategyBrief),
          negativePrompt: this.buildNegativePrompt(strategyBrief),
          aspectRatio: aspect.ratio,
          style: strategyBrief.visualStyle === 'ugc' ? 'ugc' : 'photorealistic',
          safetyLevel: 'strict',
          conceptId: `concept-${strategyBrief.primaryAngle}`,
          variation: 1,
        });
      }
    }

    return visualPrompts;
  }

  /**
   * Validate aspect ratio
   */
  private validateAspectRatio(ratio: string): '1:1' | '16:9' | '9:16' | '4:3' {
    const valid = ['1:1', '16:9', '9:16', '4:3'];
    return valid.includes(ratio) ? (ratio as any) : '1:1';
  }

  /**
   * Build negative prompt for brand safety
   */
  private buildNegativePrompt(strategyBrief: StrategyBrief): string {
    const baseNegatives = [...STANDARD_NEGATIVE_PROMPTS];

    // Add style-specific negatives
    if (strategyBrief.visualStyle === 'ugc') {
      baseNegatives.push('studio lighting', 'professional backdrop', 'posed');
    } else if (strategyBrief.visualStyle === 'professional') {
      baseNegatives.push('messy', 'amateur', 'shaky');
    }

    return baseNegatives.join(', ');
  }

  /**
   * Get default prompt when generation fails - NOW VERTICAL-SPECIFIC
   */
  private getDefaultPrompt(input: NeuralEngineInput, strategyBrief: StrategyBrief): string {
    const stylePrefix = strategyBrief.visualStyle === 'ugc'
      ? 'Candid smartphone photo of'
      : 'Professional photograph of';

    // Vertical-specific fallback prompts
    const verticalPrompts: Record<string, string> = {
      'Car Loans': `${stylePrefix} a happy Latino family standing proudly next to their new sedan car in a dealership parking lot. The father has the car keys in hand. Natural daylight, authentic moment of achievement. Shot with shallow depth of field.`,
      'Auto Loans': `${stylePrefix} a young Latino professional receiving car keys from a salesperson at a car dealership. Bright showroom, new car visible in background. Genuine smile, moment of success.`,
      'Personal Loans': `${stylePrefix} a confident Latino person in their 30s reviewing financial documents at home with a satisfied expression. Laptop and paperwork visible. Warm natural lighting, sense of financial control.`,
      'Credit Cards': `${stylePrefix} a young Latino professional making a payment with a credit card at a modern store. Clean, lifestyle moment. Natural lighting, genuine smile.`,
      'Insurance': `${stylePrefix} a happy Latino family (parents and children) in front of their home. Warm, protective atmosphere. Natural daylight, authentic family moment.`,
      'Solar': `${stylePrefix} a Latino homeowner pointing at newly installed solar panels on their roof. Blue sky, modern home. Sense of pride and sustainability.`,
      'Medicare': `${stylePrefix} a happy Latino senior couple at a doctor's office, receiving good news. Warm, caring atmosphere. Natural lighting, genuine smiles.`,
      'Debt Relief': `${stylePrefix} a relieved Latino person in their 40s tearing up old bills with a smile. Home office setting. Natural lighting, sense of freedom.`,
    };

    // Try to find a matching vertical
    const lowerVertical = input.offer.vertical.toLowerCase();
    for (const [key, prompt] of Object.entries(verticalPrompts)) {
      if (key.toLowerCase() === lowerVertical || lowerVertical.includes(key.toLowerCase())) {
        console.log(`[${AGENT_NAME}] 📋 Using vertical-specific fallback prompt for: ${key}`);
        return prompt;
      }
    }

    // Generic fallback with product context
    console.warn(`[${AGENT_NAME}] ⚠️ Using generic fallback prompt for: ${input.offer.vertical}`);
    return `${stylePrefix} a friendly Latino person in their ${this.getDemoAge()} in a relevant setting for ${input.offer.vertical}. Natural daylight, warm atmosphere. The person looks satisfied and confident. Include visual elements related to ${input.offer.vertical}. Shot with shallow depth of field, authentic lifestyle feel.`;
  }

  /**
   * Get demographic age range for prompts
   */
  private getDemoAge(): string {
    return '30s';
  }

  /**
   * Generate fallback prompts without AI
   */
  private generateFallbackPrompts(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief
  ): VisualPrompt[] {
    const aspects = PLATFORM_ASPECTS[input.platform] || PLATFORM_ASPECTS.META;

    const basePrompt = this.getDefaultPrompt(input, strategyBrief);
    const negativePrompt = this.buildNegativePrompt(strategyBrief);

    const prompts: VisualPrompt[] = [];

    for (const aspect of aspects) {
      for (let v = 1; v <= VARIATIONS_PER_CONCEPT; v++) {
        prompts.push({
          prompt: basePrompt,
          negativePrompt,
          aspectRatio: aspect.ratio,
          style: strategyBrief.visualStyle === 'ugc' ? 'ugc' : 'photorealistic',
          safetyLevel: 'strict',
          conceptId: `fallback-${strategyBrief.primaryAngle}`,
          variation: v,
        });
      }
    }

    return prompts;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let visualEngineerInstance: VisualEngineerAgent | null = null;

export function getVisualEngineerAgent(): VisualEngineerAgent {
  if (!visualEngineerInstance) {
    visualEngineerInstance = new VisualEngineerAgent();
  }
  return visualEngineerInstance;
}
