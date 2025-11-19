import Anthropic from '@anthropic-ai/sdk';
import { v1, helpers } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * AI Service
 * Handles all AI-powered content generation:
 * - Copy Master generation (Anthropic Claude Sonnet 4)
 * - Keywords generation (Anthropic Claude Sonnet 4)
 * - Article generation for RSOC (Anthropic Claude Sonnet 4)
 * - Ad copy generation (Anthropic Claude Sonnet 4)
 * - Image generation (Google Vertex AI - Imagen 4 Fast)
 * - Video generation (Google Vertex AI - Veo 3.1 Fast)
 */

// Initialize clients
const { PredictionServiceClient } = v1;

interface GenerateCopyMasterParams {
  offerName: string;
  offerDescription?: string;
  vertical?: string;
  country: string;
  language: string;
}

interface GenerateKeywordsParams {
  offerName: string;
  copyMaster: string;
  count?: number; // 3-10, default 6
  country: string;
}

interface GenerateArticleParams {
  offerName: string;
  copyMaster: string;
  keywords: string[];
  country: string;
  language: string;
}

interface GenerateAdCopyParams {
  offerName: string;
  copyMaster: string;
  platform: 'META' | 'TIKTOK';
  adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  targetAudience?: string;
}

interface GenerateImageParams {
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  negativePrompt?: string;
}

interface GenerateVideoParams {
  prompt: string;
  durationSeconds?: number; // 1-8 seconds for Veo 3.1 Fast
  aspectRatio?: '16:9' | '9:16' | '1:1';
  fromImageUrl?: string; // Optional: generate video from image
}

class AIService {
  private anthropic: Anthropic;
  private vertexAiClient: any;
  private storage: Storage;

  constructor() {
    // Initialize Anthropic
    this.anthropic = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    // Initialize Google Cloud clients
    this.vertexAiClient = new PredictionServiceClient({
      apiEndpoint: `${env.GCP_LOCATION}-aiplatform.googleapis.com`,
    });

    this.storage = new Storage({
      projectId: env.GCP_PROJECT_ID,
    });
  }

  // ============================================
  // TEXT GENERATION (Anthropic Claude)
  // ============================================

  /**
   * Generate Copy Master - the main communication angle aligned with the offer
   */
  async generateCopyMaster(params: GenerateCopyMasterParams): Promise<string> {
    // Map countries to their specific dialect rules
    const countryDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms. Never use "vos" or Argentine forms.',
      'CO': 'Colombian Spanish: Use "tú/usted" forms. Formal and clear.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "querés", "podés").',
      'ES': 'European Spanish: Use "tú/vosotros" forms.',
      'CL': 'Chilean Spanish: Use "tú" forms.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms.',
      'US': 'US Spanish (Neutral Latin American): Use "tú" forms.',
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese.',
    };

    const dialectRule = countryDialectRules[params.country] || 'Use neutral, formal language.';

    const systemPrompt = `You are an expert digital marketing copywriter specialized in creating compelling copy masters for advertising campaigns.

A Copy Master is the central communication message that defines the angle and tone of an advertising campaign.

CRITICAL REQUIREMENTS:
- Perfect spelling and grammar (zero tolerance for errors)
- ${dialectRule}
- Use formal or semi-formal tone (NEVER informal/casual)
- NO exaggerated claims (e.g., "guaranteed", "100%", "always")
- NO invented statistics or fake data
- Truthful, realistic, and professional language
- Aligned with the offer's value proposition
- Culturally relevant for the target country
- Emotionally compelling but honest
- Concise (2-3 sentences max)

Your task is to create a Copy Master that will serve as the foundation for all campaign content and pass strict editorial review.`;

    const userPrompt = `Create a Copy Master for the following advertising campaign:

Offer: ${params.offerName}
${params.offerDescription ? `Description: ${params.offerDescription}` : ''}
${params.vertical ? `Vertical: ${params.vertical}` : ''}
Target Country: ${params.country}
Language: ${params.language}

CRITICAL: ${dialectRule}

Generate a compelling Copy Master that:
- Uses perfect grammar for ${params.country}
- Uses formal/semi-formal tone
- Makes NO exaggerated claims
- Is truthful and professional
- Captures the essence of this offer and resonates with the target audience`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const copyMaster = message.content[0].type === 'text' ? message.content[0].text : '';

    // Save to database
    await this.saveAIContent({
      contentType: 'copy_master',
      content: { copyMaster },
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return copyMaster.trim();
  }

  /**
   * Generate Keywords for Tonic campaigns
   */
  async generateKeywords(params: GenerateKeywordsParams): Promise<string[]> {
    const count = params.count || 6;

    const systemPrompt = `You are an expert SEO and PPC specialist. Generate high-performing keywords for digital advertising campaigns.

CRITICAL REQUIREMENTS:
- Perfect spelling (zero tolerance for errors)
- Relevant to the offer and copy master
- Search-intent driven (what users actually search for)
- Mix of broad and specific terms
- Culturally appropriate for the target country
- Use natural, common search terms (not promotional language)
- NO exaggerated or misleading terms
- Professional and realistic keywords

IMPORTANT: Return ONLY a valid JSON array, no markdown formatting, no code blocks, no explanations.`;

    const userPrompt = `Generate ${count} high-quality keywords for this advertising campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Target Country: ${params.country}

Keywords must:
- Have perfect spelling
- Be realistic search terms users would actually type
- Be appropriate for ${params.country}
- Not include exaggerated claims

Return format: ["keyword1", "keyword2", ...]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      temperature: 0.8,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    const keywords = JSON.parse(cleanedResponse);

    // Save to database
    await this.saveAIContent({
      contentType: 'keywords',
      content: { keywords },
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return keywords;
  }

  /**
   * Generate Article content for RSOC campaigns
   */
  async generateArticle(params: GenerateArticleParams): Promise<{
    headline: string;
    teaser: string;
    contentGenerationPhrases: string[];
  }> {
    // Map countries to their specific Spanish dialect rules
    const countryDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres", "puedes"). Never use "vos" or Argentine forms like "soñás", "querés", "podés".',
      'CO': 'Colombian Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres", "puedes"). Formal and clear language.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "soñás", "querés", "podés"). Informal but professional tone.',
      'ES': 'European Spanish: Use "tú/vosotros" forms (e.g., "sueñas", "soñáis"). Use "vosotros" for plural informal.',
      'CL': 'Chilean Spanish: Use "tú" forms (e.g., "sueñas", "quieres"). Avoid excessive Chilean slang.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres"). Formal and respectful.',
      'US': 'US Spanish (Neutral Latin American): Use "tú" forms (e.g., "sueñas", "quieres"). Neutral, clear vocabulary.',
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese conjugations.',
    };

    const dialectRule = countryDialectRules[params.country] || 'Use neutral, formal language appropriate for the target country.';

    const systemPrompt = `You are an expert content writer specialized in creating high-quality articles for native advertising that pass strict editorial review.

CRITICAL REQUIREMENTS (Article will be REJECTED if these are violated):

1. LANGUAGE & GRAMMAR:
   - Perfect spelling and grammar - zero tolerance for errors
   - ${dialectRule}
   - Use formal or semi-formal tone - NEVER informal/casual language
   - Match the EXACT dialect of the target country

2. FACTUAL ACCURACY:
   - NEVER invent statistics, numbers, or data
   - NEVER make exaggerated claims (e.g., "guaranteed", "100%", "always")
   - Use realistic, verifiable information only
   - If mentioning data, use general terms like "many people", "studies suggest" instead of fake percentages

3. CONTENT QUALITY:
   - Headlines must be compelling but truthful - no clickbait
   - Teaser must be informative and engaging (250-1000 characters)
   - Content generation phrases: EXACTLY 3-5 phrases (CRITICAL: Tonic will reject if less than 3 or more than 5)
   - Natural tone - not overly promotional or salesy

4. COMPLIANCE:
   - Appropriate for the offer type (loans, insurance, etc.)
   - No misleading statements
   - Professional and trustworthy tone

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations.`;

    const userPrompt = `Create article content for this RSOC campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Keywords: ${params.keywords.join(', ')}
Country: ${params.country} (CRITICAL: Use the EXACT dialect for ${params.country})
Language: ${params.language}

REMEMBER:
- ${dialectRule}
- Perfect grammar and spelling
- NO invented data or exaggerated claims
- Formal/semi-formal tone only
- Truthful, valuable content
- CRITICAL: contentGenerationPhrases must be EXACTLY 3, 4, or 5 phrases (NOT 2, NOT 6, NOT 7!)

Return a JSON object with:
{
  "headline": "engaging headline (max 256 characters)",
  "teaser": "compelling opening paragraph (250-1000 characters)",
  "contentGenerationPhrases": ["phrase1", "phrase2", "phrase3", "phrase4"]
}

IMPORTANT: The contentGenerationPhrases array MUST contain between 3 and 5 items. If you generate more than 5 or less than 3, the request will be REJECTED by Tonic.`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    const article = JSON.parse(cleanedResponse);

    // CRITICAL VALIDATION: Tonic requires EXACTLY 3-5 content generation phrases
    if (!article.contentGenerationPhrases || !Array.isArray(article.contentGenerationPhrases)) {
      throw new Error('AI failed to generate contentGenerationPhrases array');
    }

    // If Claude generated more than 5 phrases, trim to 5
    if (article.contentGenerationPhrases.length > 5) {
      logger.warn('ai', `Generated ${article.contentGenerationPhrases.length} phrases, trimming to 5 for Tonic compliance`, {
        original: article.contentGenerationPhrases.length,
        trimmed: 5
      });
      article.contentGenerationPhrases = article.contentGenerationPhrases.slice(0, 5);
    }

    // If Claude generated less than 3 phrases, throw error (cannot auto-fix)
    if (article.contentGenerationPhrases.length < 3) {
      throw new Error(`AI generated only ${article.contentGenerationPhrases.length} content generation phrases, but Tonic requires 3-5. Please retry.`);
    }

    // Save to database
    await this.saveAIContent({
      contentType: 'article',
      content: article,
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return article;
  }

  /**
   * Generate Ad Copy for Meta/TikTok
   */
  async generateAdCopy(params: GenerateAdCopyParams): Promise<{
    primaryText: string;
    headline: string;
    description: string;
    callToAction: string;
  }> {
    const platformGuidelines = {
      META: {
        primaryTextMax: 125,
        headlineMax: 40,
        descriptionMax: 30,
        ctas: [
          'LEARN_MORE',
          'SHOP_NOW',
          'SIGN_UP',
          'DOWNLOAD',
          'GET_QUOTE',
          'APPLY_NOW',
        ],
      },
      TIKTOK: {
        primaryTextMax: 100,
        headlineMax: 100,
        descriptionMax: 999,
        ctas: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW'],
      },
    };

    const guidelines = platformGuidelines[params.platform];

    const systemPrompt = `You are an expert performance marketer creating ad copy for ${params.platform}.

Guidelines for ${params.platform}:
- Primary text: max ${guidelines.primaryTextMax} characters
- Headline: max ${guidelines.headlineMax} characters
- Description: max ${guidelines.descriptionMax} characters

CRITICAL REQUIREMENTS:
- Perfect spelling and grammar (zero tolerance for errors)
- Formal or semi-formal tone (NO informal/casual language)
- NO exaggerated claims (e.g., "guaranteed", "100%", "never")
- NO invented statistics or fake data
- Attention-grabbing but truthful and realistic
- Conversion-focused but professional
- Clear, action-oriented language
- Complies with ${params.platform} advertising policies

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations.`;

    const userPrompt = `Create ad copy for this campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Platform: ${params.platform}
Ad Format: ${params.adFormat}
${params.targetAudience ? `Target Audience: ${params.targetAudience}` : ''}

Return JSON:
{
  "primaryText": "main ad text",
  "headline": "compelling headline",
  "description": "description text",
  "callToAction": "CTA text (one of: ${guidelines.ctas.join(', ')})"
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      temperature: 0.8,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    const adCopy = JSON.parse(cleanedResponse);

    // Save to database
    await this.saveAIContent({
      contentType: 'ad_copy',
      content: adCopy,
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return adCopy;
  }

  /**
   * Generate targeting suggestions based on offer and copy
   */
  async generateTargetingSuggestions(params: {
    offerName: string;
    copyMaster: string;
    platform: 'META' | 'TIKTOK';
  }): Promise<{
    ageGroups: string[];
    interests: string[];
    behaviors?: string[];
    demographics: string;
  }> {
    const systemPrompt = `You are an expert media buyer specialized in ${params.platform} Ads targeting.

Analyze the offer and copy master to suggest optimal targeting parameters. Be specific and data-driven.

IMPORTANT: Return ONLY valid JSON, no markdown formatting, no code blocks, no explanations.`;

    const userPrompt = `Suggest targeting for this campaign on ${params.platform}:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}

Return JSON:
{
  "ageGroups": ["age ranges that match the offer"],
  "interests": ["specific interest categories"],
  "behaviors": ["behavioral targeting categories (Meta only)"],
  "demographics": "detailed description of ideal audience"
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
    const cleanedResponse = this.cleanJsonResponse(responseText);
    return JSON.parse(cleanedResponse);
  }

  // ============================================
  // IMAGE GENERATION (Vertex AI - Imagen 4 Fast)
  // ============================================

  /**
   * Generate image using Vertex AI Imagen 4 Fast
   */
  async generateImage(params: GenerateImageParams): Promise<{
    imageUrl: string;
    gcsPath: string;
  }> {
    const project = env.GCP_PROJECT_ID;
    const location = env.GCP_LOCATION;
    const model = 'imagen-4.0-fast-generate-001';

    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${model}`;

    const instanceValue = helpers.toValue({
      prompt: params.prompt,
      negativePrompt: params.negativePrompt || '',
      aspectRatio: params.aspectRatio || '1:1',
      sampleCount: 1,
    });

    const instances = [instanceValue];
    const request = {
      endpoint,
      instances,
    };

    const [response] = await this.vertexAiClient.predict(request);

    // Get generated image (base64)
    const predictions = response.predictions;
    const imageBase64 = predictions[0].structValue?.fields?.bytesBase64Encoded?.stringValue;

    if (!imageBase64) {
      throw new Error('No image generated from Vertex AI');
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageBase64, 'base64');

    // Upload to Google Cloud Storage
    const fileName = `generated-images/${Date.now()}-${Math.random().toString(36).substring(7)}.png`;
    const bucket = this.storage.bucket(env.GCP_STORAGE_BUCKET);
    const file = bucket.file(fileName);

    await file.save(imageBuffer, {
      contentType: 'image/png',
      metadata: {
        metadata: {
          prompt: params.prompt,
          model: model,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Generate signed URL (valid for 7 days) instead of makePublic()
    // This works with Uniform Bucket-Level Access enabled
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const imageUrl = signedUrl;

    return {
      imageUrl,
      gcsPath: fileName,
    };
  }

  // ============================================
  // VIDEO GENERATION (Vertex AI - Veo 3.1 Fast)
  // ============================================

  /**
   * Generate video using Vertex AI Veo 3.1 Fast
   */
  async generateVideo(params: GenerateVideoParams): Promise<{
    videoUrl: string;
    gcsPath: string;
  }> {
    const project = env.GCP_PROJECT_ID;
    const location = env.GCP_LOCATION;
    const model = 'veo-3.1-fast'; // Or 'veo-3.0-generate-001'

    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/${model}`;

    const instanceValue = helpers.toValue({
      prompt: params.prompt,
      durationSeconds: params.durationSeconds || 5,
      aspectRatio: params.aspectRatio || '16:9',
      ...(params.fromImageUrl && { imageUrl: params.fromImageUrl }),
    });

    const instances = [instanceValue];
    const request = {
      endpoint,
      instances,
    };

    const [response] = await this.vertexAiClient.predict(request);

    // Get generated video (base64 or GCS path)
    const predictions = response.predictions;
    const videoBase64 = predictions[0].structValue?.fields?.bytesBase64Encoded?.stringValue;

    if (!videoBase64) {
      throw new Error('No video generated from Vertex AI');
    }

    // Convert base64 to buffer
    const videoBuffer = Buffer.from(videoBase64, 'base64');

    // Upload to Google Cloud Storage
    const fileName = `generated-videos/${Date.now()}-${Math.random().toString(36).substring(7)}.mp4`;
    const bucket = this.storage.bucket(env.GCP_STORAGE_BUCKET);
    const file = bucket.file(fileName);

    await file.save(videoBuffer, {
      contentType: 'video/mp4',
      metadata: {
        metadata: {
          prompt: params.prompt,
          model: model,
          durationSeconds: params.durationSeconds || 5,
          generatedAt: new Date().toISOString(),
        },
      },
    });

    // Generate signed URL (valid for 7 days) instead of makePublic()
    // This works with Uniform Bucket-Level Access enabled
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const videoUrl = signedUrl;

    return {
      videoUrl,
      gcsPath: fileName,
    };
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Clean JSON response from Claude (removes markdown code blocks)
   */
  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks (```json ... ``` or ``` ... ```)
    let cleaned = text.trim();

    // Remove opening code block
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');

    // Remove closing code block
    cleaned = cleaned.replace(/\n?```\s*$/, '');

    return cleaned.trim();
  }

  /**
   * Save AI-generated content to database
   */
  private async saveAIContent(data: {
    campaignId?: string;
    contentType: string;
    content: any;
    model: string;
    prompt: string;
    tokensUsed?: number;
  }) {
    if (!data.campaignId) {
      // If no campaign ID, skip saving (used during testing)
      return;
    }

    await prisma.aIContent.create({
      data: {
        campaignId: data.campaignId,
        contentType: data.contentType,
        content: data.content,
        model: data.model,
        prompt: data.prompt,
        tokensUsed: data.tokensUsed,
      },
    });
  }
}

// Export singleton instance
export const aiService = new AIService();
export default aiService;
