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
    required: 'A CAR (sedan, SUV, or truck) must be prominently featured. NO motorcycles, NO bikes, NO scooters - ONLY cars/automobiles.',
    examples: 'car dealership with sedan/SUV, person with new car (4 wheels), car keys handover next to sedan, family in car, driving a car',
  },
  'Auto Loans': {
    required: 'A CAR (sedan, SUV, or truck) must be prominently featured. NO motorcycles, NO bikes, NO scooters - ONLY cars/automobiles.',
    examples: 'car dealership with sedan/SUV, person with new car (4 wheels), car keys handover next to sedan, family in car, driving a car',
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
   * Analyze reference image to extract style characteristics
   * Uses Gemini's vision capabilities to understand the visual style
   */
  private async analyzeReferenceImage(imageUrl: string): Promise<string | null> {
    console.log(`[${AGENT_NAME}] 🖼️ Analyzing reference image for style guidance...`);

    try {
      // Fetch the image and convert to base64
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn(`[${AGENT_NAME}] Failed to fetch reference image: ${response.status}`);
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const base64Image = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = response.headers.get('content-type') || 'image/jpeg';

      // Use Gemini Vision to analyze the image
      const analysisResponse = await this.gemini.models.generateContent({
        model: VISUAL_ENGINEER_CONFIG.model.model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: base64Image,
                },
              },
              {
                text: `Analyze this reference image and extract its visual style characteristics.

Focus on:
1. **Color Palette**: What are the dominant colors? (e.g., warm earth tones, cool blues, muted pastels)
2. **Composition**: How is the image composed? (e.g., centered, rule of thirds, negative space usage)
3. **Mood/Atmosphere**: What feeling does it evoke? (e.g., calm, energetic, professional, playful)
4. **Lighting**: What type of lighting? (e.g., natural sunlight, soft diffused, high contrast, studio)
5. **Texture & Detail Level**: Is it clean/minimal or rich in texture/detail?
6. **Visual Elements**: Key visual elements that define this style (e.g., geometric shapes, gradients, organic forms)

Provide a concise analysis (3-5 sentences) that could be used to guide AI image generation to match this style.
Format: Start directly with the style description, no intro phrases.`,
              },
            ],
          },
        ],
        config: {
          temperature: 0.3, // Lower temperature for more consistent analysis
          maxOutputTokens: 500,
        },
      });

      const analysis = analysisResponse.text || '';

      if (analysis) {
        console.log(`[${AGENT_NAME}] ✅ Reference image analyzed: ${analysis.substring(0, 100)}...`);
        return analysis;
      }

      return null;
    } catch (error: any) {
      console.warn(`[${AGENT_NAME}] ⚠️ Reference image analysis failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate prompts using Gemini Flash
   */
  private async generatePrompts(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    culturalContext: CulturalContext
  ): Promise<VisualPrompt[]> {
    // Analyze reference image if provided
    let referenceImageAnalysis: string | null = null;
    if (input.referenceImageUrl) {
      referenceImageAnalysis = await this.analyzeReferenceImage(input.referenceImageUrl);
    }

    const prompt = this.buildPromptGenerationPrompt(input, strategyBrief, culturalContext, referenceImageAnalysis);

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
    culturalContext: CulturalContext,
    referenceImageAnalysis?: string | null
  ): string {
    const aspects = PLATFORM_ASPECTS[input.platform] || PLATFORM_ASPECTS.META;

    // CRITICAL: Try offer name FIRST (more specific), then fall back to vertical
    // e.g., "Car Loans" is more specific than "Finance"
    const verticalReqs = this.getVerticalRequirements(input.offer.name, input.offer.vertical);

    // Use user-selected visual style if provided, otherwise use strategy brief
    const visualStyle = input.visualStyle || strategyBrief.visualStyle;

    console.log(`[${AGENT_NAME}] 📋 Building prompt for offer: "${input.offer.name}" (vertical: "${input.offer.vertical}")`);
    console.log(`[${AGENT_NAME}] 📋 Visual requirements: ${verticalReqs.required}`);
    console.log(`[${AGENT_NAME}] 🎨 Visual style: ${visualStyle} (user-selected: ${!!input.visualStyle})`);

    // Include copyMaster if available - it's critical context from the manager
    const copyMasterContext = input.copyMaster
      ? `\n## COPY MASTER (Manager's Ad Message)\n"${input.copyMaster}"\nThis text will be overlaid on the image. The visual should SUPPORT and COMPLEMENT this message.\n`
      : '';

    // Include reference image analysis if available
    const referenceImageContext = referenceImageAnalysis
      ? `\n## 🎨 REFERENCE IMAGE STYLE ANALYSIS (HIGH PRIORITY)
The user has provided a reference image. Your prompts MUST incorporate the following style characteristics extracted from the reference:

"${referenceImageAnalysis}"

⚠️ CRITICAL: Match these visual characteristics as closely as possible:
- Use the same color palette and mood
- Mirror the composition style and lighting
- Replicate the overall aesthetic feel
- Apply the same texture and detail level

This reference image takes PRIORITY over generic style descriptions.\n`
      : '';

    if (referenceImageAnalysis) {
      console.log(`[${AGENT_NAME}] 🖼️ Including reference image analysis in prompt generation`);
    }

    // Build style-specific instructions
    const styleInstructions = this.getStyleDescription(visualStyle);

    // Check if this is a text-centric or minimalist style that prioritizes clean backgrounds
    const isBackgroundFocusedStyle = ['text_centric', 'minimalist', 'graphic_design'].includes(visualStyle);

    // For text_centric/minimalist styles, modify the visual requirements
    const visualRequirementsSection = isBackgroundFocusedStyle
      ? `## VISUAL STYLE TAKES PRIORITY - "${visualStyle.toUpperCase()}"
⚠️ IMPORTANT: For this style, create CLEAN, MINIMALIST backgrounds that are optimized for text overlay.

The product context is "${input.offer.name}", but DO NOT show literal products, people, or complex scenes.
Instead, create abstract or minimal designs that EVOKE the theme through:
- Color schemes associated with ${input.offer.name} (e.g., automotive blues/grays for car loans)
- Subtle abstract shapes or gradients
- Clean geometric patterns
- Solid colors with depth
- Negative space for text placement

The background should SUPPORT text overlay, not compete with it.`
      : `## ⚠️ CRITICAL VISUAL REQUIREMENT FOR "${input.offer.name.toUpperCase()}" ⚠️
${verticalReqs.required}
Example scenes: ${verticalReqs.examples}

THIS IS MANDATORY - Every generated prompt MUST include the product/service visual element described above.
An ad for "${input.offer.name}" without the relevant product visual will be rejected.`;

    // Adjust style requirements based on whether it's background-focused
    const styleRequirementsSection = isBackgroundFocusedStyle
      ? `## STYLE REQUIREMENTS (USER SELECTED: "${visualStyle.toUpperCase()}")
- Style: ${styleInstructions}
- CRITICAL: Create ABSTRACT or MINIMALIST backgrounds, NOT realistic photos
- CRITICAL: NO people, products, cars, or complex scenes
- CRITICAL: NO text, logos, or watermarks in the image
- Focus on: solid colors, gradients, geometric shapes, abstract patterns
- Leave plenty of NEGATIVE SPACE for text overlay
- Use colors that relate to ${input.offer.name} thematically`
      : `## STYLE REQUIREMENTS (USER SELECTED: "${visualStyle.toUpperCase()}")
- Style: ${styleInstructions}
- CRITICAL: The image must look NATIVE to ${input.platform}. It should NOT look like a stock photo.
- CRITICAL: NO text, logos, or watermarks in the image. Text will be added programmatically later.
- Use natural, authentic settings and real-looking people
- Lighting should be natural, slightly imperfect (like a real photo)`;

    return `You are an expert prompt engineer for AI image generation (Imagen 3).

## TASK
Generate image generation prompts for the following advertising campaign.

## CAMPAIGN CONTEXT
- Platform: ${input.platform}
- Country: ${culturalContext.country}
- Offer/Product: ${input.offer.name}
- Vertical Category: ${input.offer.vertical}
- Visual Style: ${visualStyle}
- Visual Concept: ${strategyBrief.visualConcept}
- Color Palette: ${strategyBrief.colorPalette.join(', ')}
- Psychological Angle: ${strategyBrief.primaryAngle}
${copyMasterContext}${referenceImageContext}
${visualRequirementsSection}

## CULTURAL CODES TO INCORPORATE
${isBackgroundFocusedStyle ? 'Use colors and subtle design elements that resonate with ' + culturalContext.country : culturalContext.visualCodes.join(', ') || 'Professional, authentic imagery'}

${styleRequirementsSection}

## ASPECT RATIOS NEEDED
${aspects.map((a) => `- ${a.ratio} (${a.width}x${a.height})`).join('\n')}

## OUTPUT FORMAT
Generate ${VARIATIONS_PER_CONCEPT} variations for each aspect ratio. Respond in JSON:

{
  "prompts": [
    {
      "prompt": "${isBackgroundFocusedStyle ? 'Minimalist abstract background with...' : 'Detailed image generation prompt that INCLUDES the required visual element...'}",
      "aspectRatio": "1:1",
      "style": "${isBackgroundFocusedStyle ? 'minimalist' : 'photorealistic|ugc'}",
      "variation": 1
    }
  ]
}

IMPORTANT RULES FOR PROMPTS:
${isBackgroundFocusedStyle ? `1. Create ABSTRACT/MINIMALIST backgrounds - NO people, products, or complex scenes
2. Use colors that evoke ${input.offer.name} thematically
3. Include plenty of negative space for text overlay
4. Focus on gradients, shapes, and clean design
5. Never include text, logos, or watermarks
6. Keep it simple and elegant` : `1. ALWAYS include the required product/visual element for the vertical (${verticalReqs.required})
2. Be specific about camera angle, lighting, and composition
3. Include the person's apparent demographics when relevant
4. Describe the setting authentically for ${culturalContext.country}
5. Never mention text, logos, or overlays
6. Focus on emotion and action, not static poses`}`;
  }

  /**
   * Get visual requirements - prioritizes offer name over vertical
   * e.g., "Car Loans" (offer) is more specific than "Finance" (vertical)
   */
  private getVerticalRequirements(offerName: string, vertical: string): { required: string; examples: string } {
    // STEP 1: Try exact match with OFFER NAME first (most specific)
    if (VERTICAL_VISUAL_REQUIREMENTS[offerName]) {
      console.log(`[${AGENT_NAME}] ✅ Found visual requirements for offer: "${offerName}"`);
      return VERTICAL_VISUAL_REQUIREMENTS[offerName];
    }

    // STEP 2: Try case-insensitive match with offer name
    const lowerOfferName = offerName.toLowerCase();
    for (const [key, value] of Object.entries(VERTICAL_VISUAL_REQUIREMENTS)) {
      if (key.toLowerCase() === lowerOfferName || lowerOfferName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerOfferName)) {
        console.log(`[${AGENT_NAME}] ✅ Found visual requirements for offer (fuzzy match): "${key}"`);
        return value;
      }
    }

    // STEP 3: Try exact match with VERTICAL
    if (VERTICAL_VISUAL_REQUIREMENTS[vertical]) {
      console.log(`[${AGENT_NAME}] ✅ Found visual requirements for vertical: "${vertical}"`);
      return VERTICAL_VISUAL_REQUIREMENTS[vertical];
    }

    // STEP 4: Try case-insensitive match with vertical
    const lowerVertical = vertical.toLowerCase();
    for (const [key, value] of Object.entries(VERTICAL_VISUAL_REQUIREMENTS)) {
      if (key.toLowerCase() === lowerVertical || lowerVertical.includes(key.toLowerCase())) {
        console.log(`[${AGENT_NAME}] ✅ Found visual requirements for vertical (fuzzy match): "${key}"`);
        return value;
      }
    }

    // STEP 5: Default fallback - use offer name for more specific context
    console.warn(`[${AGENT_NAME}] ⚠️ No specific visual requirements for offer: "${offerName}" or vertical: "${vertical}". Using generic.`);
    return {
      required: `The image must clearly relate to ${offerName} and show relevant context for ${vertical}`,
      examples: 'relevant product, service in action, satisfied customer with product',
    };
  }

  /**
   * Get style description for prompt
   * Supports multiple visual styles for creative variety
   */
  private getStyleDescription(style: string): string {
    const descriptions: Record<string, string> = {
      // Original styles
      ugc: 'User-generated content style. Looks like it was shot on a smartphone by a real person. Slightly imperfect framing, natural lighting, casual setting. Amateur aesthetic.',
      professional: 'Clean, professional photography. Well-lit, properly composed, but still authentic and relatable. Studio quality.',
      native: 'Platform-native style. Looks like organic content that would appear in feeds. Authentic, engaging, scroll-stopping.',
      editorial: 'Magazine-quality photography. Polished but not overly staged. Lifestyle editorial feel. High production value.',

      // NEW styles for creative variety
      photography: 'High-quality realistic photography. Natural lighting, authentic setting, real-looking subjects. Professional but not stock-photo-like.',
      graphic_design: 'Clean graphic design aesthetic. Bold colors, geometric shapes, modern illustrations. Flat design elements with depth. Digital art style that feels contemporary and eye-catching.',
      text_centric: 'Minimalist background design optimized for text overlay. Solid colors, subtle gradients, or abstract patterns. Clean space for headline placement. Background should support, not compete with, text.',
      minimalist: 'Clean, simple, minimal elements. Lots of negative space. One clear focal point. Scandinavian design influence. Elegant simplicity.',
    };

    return descriptions[style] || descriptions.photography;
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

    // Map input visual style to VisualPrompt style
    const visualStyle = this.mapToVisualPromptStyle(input.visualStyle || strategyBrief.visualStyle);

    // Transform parsed prompts to VisualPrompt format
    // v2.9.3: Fixed undefined values that cause Firestore errors
    const visualPrompts: VisualPrompt[] = (parsed.prompts || []).map((p: any, i: number) => {
      const prompt: VisualPrompt = {
        prompt: p.prompt || this.getDefaultPrompt(input, strategyBrief),
        negativePrompt: this.buildNegativePrompt(strategyBrief, input.offer.name),
        aspectRatio: this.validateAspectRatio(p.aspectRatio),
        style: visualStyle,
        safetyLevel: 'strict' as const,
        conceptId: `concept-${strategyBrief.primaryAngle}`,
        variation: p.variation || i + 1,
      };
      // Only include optional fields if they have defined values (avoid undefined in Firestore)
      if (input.includeTextOverlay !== undefined) {
        prompt.includeTextOverlay = input.includeTextOverlay;
      }
      if (input.customTextOverlay !== undefined && input.customTextOverlay !== null) {
        prompt.textOverlayContent = input.customTextOverlay;
      }
      return prompt;
    });

    // Ensure we have at least one prompt per aspect ratio
    // v2.9.3: Fixed undefined values that cause Firestore errors
    for (const aspect of aspects) {
      const hasAspect = visualPrompts.some((p) => p.aspectRatio === aspect.ratio);
      if (!hasAspect) {
        const defaultPrompt: VisualPrompt = {
          prompt: this.getDefaultPrompt(input, strategyBrief),
          negativePrompt: this.buildNegativePrompt(strategyBrief, input.offer.name),
          aspectRatio: aspect.ratio,
          style: visualStyle,
          safetyLevel: 'strict',
          conceptId: `concept-${strategyBrief.primaryAngle}`,
          variation: 1,
        };
        // Only include optional fields if they have defined values
        if (input.includeTextOverlay !== undefined) {
          defaultPrompt.includeTextOverlay = input.includeTextOverlay;
        }
        if (input.customTextOverlay !== undefined && input.customTextOverlay !== null) {
          defaultPrompt.textOverlayContent = input.customTextOverlay;
        }
        visualPrompts.push(defaultPrompt);
      }
    }

    return visualPrompts;
  }

  /**
   * Map visual style to VisualPrompt style type
   */
  private mapToVisualPromptStyle(style: string): 'photorealistic' | 'illustration' | 'ugc' | 'graphic_design' | 'text_centric' | 'editorial' | 'minimalist' {
    const styleMap: Record<string, 'photorealistic' | 'illustration' | 'ugc' | 'graphic_design' | 'text_centric' | 'editorial' | 'minimalist'> = {
      'photography': 'photorealistic',
      'professional': 'photorealistic',
      'native': 'photorealistic',
      'ugc': 'ugc',
      'graphic_design': 'graphic_design',
      'text_centric': 'text_centric',
      'editorial': 'editorial',
      'minimalist': 'minimalist',
    };
    return styleMap[style] || 'photorealistic';
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
  private buildNegativePrompt(strategyBrief: StrategyBrief, offerName?: string): string {
    const baseNegatives = [...STANDARD_NEGATIVE_PROMPTS];

    // Add style-specific negatives
    if (strategyBrief.visualStyle === 'ugc') {
      baseNegatives.push('studio lighting', 'professional backdrop', 'posed');
    } else if (strategyBrief.visualStyle === 'professional') {
      baseNegatives.push('messy', 'amateur', 'shaky');
    }

    // Add offer-specific negatives
    const lowerOffer = (offerName || '').toLowerCase();
    if (lowerOffer.includes('car') || lowerOffer.includes('auto')) {
      // For car/auto loans, explicitly exclude motorcycles
      baseNegatives.push('motorcycle', 'motorbike', 'scooter', 'bike', 'bicycle', 'moped');
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
    const negativePrompt = this.buildNegativePrompt(strategyBrief, input.offer.name);

    // Use user-selected visual style or fall back to strategy brief
    const visualStyle = this.mapToVisualPromptStyle(input.visualStyle || strategyBrief.visualStyle);

    const prompts: VisualPrompt[] = [];

    for (const aspect of aspects) {
      for (let v = 1; v <= VARIATIONS_PER_CONCEPT; v++) {
        prompts.push({
          prompt: basePrompt,
          negativePrompt,
          aspectRatio: aspect.ratio,
          style: visualStyle,
          safetyLevel: 'strict',
          conceptId: `fallback-${strategyBrief.primaryAngle}`,
          variation: v,
          includeTextOverlay: input.includeTextOverlay,
          textOverlayContent: input.customTextOverlay,
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
