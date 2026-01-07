/**
 * RSOC Creative Neural Engine - Global Scout Agent
 *
 * Role: Cultural and Demographic Analyst
 * Model: Gemini 2.0 Flash (with Google Search Grounding)
 *
 * This agent eliminates "cultural hallucination" by performing real-time
 * research about the target country and category before any creative generation.
 *
 * Key Capabilities:
 * - Google Search Grounding for live data access
 * - Cultural codes identification
 * - Current trends and competitor analysis
 * - Demographic targeting recommendations
 */

import { GoogleGenAI } from '@google/genai';
import { CulturalContext, NeuralEngineInput, AgentError } from '../types';
import { GLOBAL_SCOUT_CONFIG } from '../config/model-configs';
import { getSemanticCacheService } from '../cache/semantic-cache.service';

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_NAME = 'GlobalScout';

// Country metadata for timezone and season calculation
const COUNTRY_METADATA: Record<string, { timezone: string; hemisphere: 'north' | 'south' }> = {
  US: { timezone: 'America/New_York', hemisphere: 'north' },
  MX: { timezone: 'America/Mexico_City', hemisphere: 'north' },
  CO: { timezone: 'America/Bogota', hemisphere: 'north' },
  AR: { timezone: 'America/Buenos_Aires', hemisphere: 'south' },
  BR: { timezone: 'America/Sao_Paulo', hemisphere: 'south' },
  ES: { timezone: 'Europe/Madrid', hemisphere: 'north' },
  UK: { timezone: 'Europe/London', hemisphere: 'north' },
  GB: { timezone: 'Europe/London', hemisphere: 'north' },
  DE: { timezone: 'Europe/Berlin', hemisphere: 'north' },
  FR: { timezone: 'Europe/Paris', hemisphere: 'north' },
  IT: { timezone: 'Europe/Rome', hemisphere: 'north' },
  AU: { timezone: 'Australia/Sydney', hemisphere: 'south' },
  JP: { timezone: 'Asia/Tokyo', hemisphere: 'north' },
  KR: { timezone: 'Asia/Seoul', hemisphere: 'north' },
  IN: { timezone: 'Asia/Kolkata', hemisphere: 'north' },
  CL: { timezone: 'America/Santiago', hemisphere: 'south' },
  PE: { timezone: 'America/Lima', hemisphere: 'south' },
  EC: { timezone: 'America/Guayaquil', hemisphere: 'south' },
  VE: { timezone: 'America/Caracas', hemisphere: 'north' },
  CA: { timezone: 'America/Toronto', hemisphere: 'north' },
  PT: { timezone: 'Europe/Lisbon', hemisphere: 'north' },
};

// ============================================================================
// GLOBAL SCOUT AGENT
// ============================================================================

export class GlobalScoutAgent {
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
   * Execute the Global Scout research
   */
  async execute(input: NeuralEngineInput): Promise<{
    success: boolean;
    data?: CulturalContext;
    error?: AgentError;
    fromCache: boolean;
  }> {
    const startTime = Date.now();

    console.log(`[${AGENT_NAME}] Starting cultural research for ${input.country}/${input.offer.vertical}`);

    try {
      // Check cache first
      if (input.useCache !== false) {
        const cached = await this.checkCache(input);
        if (cached) {
          console.log(`[${AGENT_NAME}] Cache hit! Returning cached research.`);
          return { success: true, data: cached, fromCache: true };
        }
      }

      // Perform live research with Gemini + Google Search Grounding
      const culturalContext = await this.performResearch(input);

      // Cache the result
      if (input.useCache !== false) {
        await this.cacheResult(input, culturalContext);
      }

      const duration = Date.now() - startTime;
      console.log(`[${AGENT_NAME}] Research completed in ${duration}ms`);

      return { success: true, data: culturalContext, fromCache: false };
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
   * Check if we have cached research for this context
   */
  private async checkCache(input: NeuralEngineInput): Promise<CulturalContext | null> {
    const cacheKey = this.buildCacheKey(input);

    try {
      const cached = await this.cacheService.getResearch(cacheKey);
      if (cached) {
        return cached as CulturalContext;
      }
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache check failed:`, error);
    }

    return null;
  }

  /**
   * Cache the research result
   */
  private async cacheResult(input: NeuralEngineInput, data: CulturalContext): Promise<void> {
    const cacheKey = this.buildCacheKey(input);

    try {
      await this.cacheService.setResearch(cacheKey, data);
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Cache write failed:`, error);
    }
  }

  /**
   * Build cache key for this research context
   */
  private buildCacheKey(input: NeuralEngineInput): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    return `${input.country}_${input.offer.vertical}_${date}`;
  }

  /**
   * Perform live research using Gemini with Google Search Grounding
   */
  private async performResearch(input: NeuralEngineInput): Promise<CulturalContext> {
    const prompt = this.buildResearchPrompt(input);

    console.log(`[${AGENT_NAME}] Calling Gemini with Google Search Grounding...`);

    // Use Gemini 2.0 Flash with grounding
    const model = this.gemini.models.generateContent({
      model: GLOBAL_SCOUT_CONFIG.model.model,
      contents: prompt,
      config: {
        temperature: GLOBAL_SCOUT_CONFIG.model.temperature,
        maxOutputTokens: GLOBAL_SCOUT_CONFIG.model.maxTokens,
        // Enable Google Search grounding
        tools: [{ googleSearch: {} }],
      },
    });

    const response = await model;

    // Extract text from response
    const text = response.text || '';

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Parse the JSON response
    const culturalContext = this.parseResearchResponse(text, input);

    return culturalContext;
  }

  /**
   * Build the research prompt
   */
  private buildResearchPrompt(input: NeuralEngineInput): string {
    const countryName = this.getCountryName(input.country);
    const vertical = input.offer.vertical;
    const offerName = input.offer.name;

    return `You are a cultural and market research analyst. Research the following for advertising purposes:

CONTEXT:
- Country: ${countryName} (${input.country})
- Industry/Vertical: ${vertical}
- Product/Service: ${offerName}
- Platform: ${input.platform}
- Language: ${input.language}

RESEARCH TASKS:
1. **Cultural Codes**: What visual elements, colors, and imagery resonate with ${countryName} audiences for ${vertical}? What are cultural taboos to avoid?

2. **Current Trends**: What are people in ${countryName} currently searching for related to ${vertical}? What are the trending topics?

3. **Competitor Activity**: What advertising approaches are competitors in ${vertical} using in ${countryName}?

4. **Demographics**: Who is the primary target audience for ${vertical} in ${countryName}? Age, gender, interests?

5. **Local Context**: What current events, seasons, or holidays might affect advertising for ${vertical} in ${countryName} right now?

IMPORTANT: Use real, current data. Do not fabricate statistics or trends.

Respond in JSON format:
{
  "visualCodes": ["list of visual elements that resonate"],
  "colorPreferences": ["preferred colors for this market"],
  "taboos": ["things to avoid in advertising"],
  "competitorActivity": ["what competitors are doing"],
  "currentTrends": ["trending topics in this vertical"],
  "searchTrends": ["what people are searching for"],
  "targetDemographic": {
    "ageRange": "25-45",
    "gender": "mixed",
    "interests": ["relevant interests"]
  }
}`;
  }

  /**
   * Parse the research response into CulturalContext
   */
  private parseResearchResponse(text: string, input: NeuralEngineInput): CulturalContext {
    // Try to extract JSON from the response
    let parsed: any;

    try {
      // Look for JSON in the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.warn(`[${AGENT_NAME}] Failed to parse JSON, using defaults`);
      parsed = this.getDefaultResearch(input);
    }

    // Get country metadata
    const countryMeta = COUNTRY_METADATA[input.country] || {
      timezone: 'UTC',
      hemisphere: 'north' as const,
    };

    // Calculate current season based on hemisphere
    const currentSeason = this.getCurrentSeason(countryMeta.hemisphere);

    return {
      country: input.country,
      language: input.language,
      timezone: countryMeta.timezone,
      currentSeason,

      visualCodes: parsed.visualCodes || [],
      colorPreferences: parsed.colorPreferences || [],
      taboos: parsed.taboos || [],

      competitorActivity: parsed.competitorActivity || [],
      currentTrends: parsed.currentTrends || [],
      searchTrends: parsed.searchTrends || [],

      targetDemographic: {
        ageRange: parsed.targetDemographic?.ageRange || '25-54',
        gender: parsed.targetDemographic?.gender || 'mixed',
        interests: parsed.targetDemographic?.interests || [],
      },

      researchedAt: new Date(),
    };
  }

  /**
   * Get default research when parsing fails
   */
  private getDefaultResearch(input: NeuralEngineInput): any {
    return {
      visualCodes: ['professional imagery', 'local faces', 'authentic settings'],
      colorPreferences: ['blue (trust)', 'green (growth)', 'white (clarity)'],
      taboos: ['avoid religious imagery', 'avoid political references'],
      competitorActivity: ['digital advertising', 'social media presence'],
      currentTrends: [input.offer.vertical],
      searchTrends: [input.offer.name, input.offer.vertical],
      targetDemographic: {
        ageRange: '25-54',
        gender: 'mixed',
        interests: [input.offer.vertical],
      },
    };
  }

  /**
   * Get current season based on hemisphere
   */
  private getCurrentSeason(hemisphere: 'north' | 'south'): string {
    const month = new Date().getMonth(); // 0-11

    if (hemisphere === 'north') {
      if (month >= 2 && month <= 4) return 'spring';
      if (month >= 5 && month <= 7) return 'summer';
      if (month >= 8 && month <= 10) return 'fall';
      return 'winter';
    } else {
      // Southern hemisphere - opposite seasons
      if (month >= 2 && month <= 4) return 'fall';
      if (month >= 5 && month <= 7) return 'winter';
      if (month >= 8 && month <= 10) return 'spring';
      return 'summer';
    }
  }

  /**
   * Get full country name from code
   */
  private getCountryName(code: string): string {
    const names: Record<string, string> = {
      US: 'United States',
      MX: 'Mexico',
      CO: 'Colombia',
      AR: 'Argentina',
      BR: 'Brazil',
      ES: 'Spain',
      UK: 'United Kingdom',
      GB: 'United Kingdom',
      DE: 'Germany',
      FR: 'France',
      IT: 'Italy',
      AU: 'Australia',
      JP: 'Japan',
      KR: 'South Korea',
      IN: 'India',
      CL: 'Chile',
      PE: 'Peru',
      EC: 'Ecuador',
      VE: 'Venezuela',
      CA: 'Canada',
      PT: 'Portugal',
    };

    return names[code] || code;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let globalScoutInstance: GlobalScoutAgent | null = null;

export function getGlobalScoutAgent(): GlobalScoutAgent {
  if (!globalScoutInstance) {
    globalScoutInstance = new GlobalScoutAgent();
  }
  return globalScoutInstance;
}
