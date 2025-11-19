import Anthropic from '@anthropic-ai/sdk';
import { aiplatform } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';

/**
 * AI Service
 * Handles all AI-powered content generation:
 * - Copy Master generation (Anthropic Claude)
 * - Keywords generation (Anthropic Claude)
 * - Article generation for RSOC (Anthropic Claude)
 * - Ad copy generation (Anthropic Claude)
 * - Image generation (Google Vertex AI - Imagen 4 Fast)
 * - Video generation (Google Vertex AI - Veo 3.1 Fast)
 */

// Initialize clients
const { PredictionServiceClient } = aiplatform.v1;
const { helpers } = aiplatform;

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
    const systemPrompt = `You are an expert digital marketing copywriter specialized in creating compelling copy masters for advertising campaigns.

A Copy Master is the central communication message that defines the angle and tone of an advertising campaign. It should be:
- Aligned with the offer's value proposition
- Culturally relevant for the target country
- Emotionally compelling and action-oriented
- Concise (2-3 sentences max)

Your task is to create a Copy Master that will serve as the foundation for all campaign content.`;

    const userPrompt = `Create a Copy Master for the following advertising campaign:

Offer: ${params.offerName}
${params.offerDescription ? `Description: ${params.offerDescription}` : ''}
${params.vertical ? `Vertical: ${params.vertical}` : ''}
Target Country: ${params.country}
Language: ${params.language}

Generate a compelling Copy Master that captures the essence of this offer and resonates with the target audience.`;

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
      model: 'claude-3.5-sonnet',
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

Keywords should be:
- Relevant to the offer and copy master
- Search-intent driven
- Mix of broad and specific terms
- Culturally appropriate for the target country

Return ONLY a JSON array of keywords, nothing else.`;

    const userPrompt = `Generate ${count} keywords for this advertising campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Target Country: ${params.country}

Return format: ["keyword1", "keyword2", ...]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
    const keywords = JSON.parse(responseText);

    // Save to database
    await this.saveAIContent({
      contentType: 'keywords',
      content: { keywords },
      model: 'claude-3.5-sonnet',
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
    const systemPrompt = `You are an expert content writer specialized in creating engaging articles for native advertising.

Create article content that:
- Has a compelling, clickable headline
- Includes an engaging teaser/introduction (250-1000 characters)
- Generates 3-5 content generation phrases that guide the article's narrative
- Aligns with the copy master and keywords
- Feels natural, not overly promotional`;

    const userPrompt = `Create article content for this RSOC campaign:

Offer: ${params.offerName}
Copy Master: ${params.copyMaster}
Keywords: ${params.keywords.join(', ')}
Country: ${params.country}
Language: ${params.language}

Return a JSON object with:
{
  "headline": "engaging headline (max 256 characters)",
  "teaser": "compelling opening paragraph (250-1000 characters)",
  "contentGenerationPhrases": ["phrase1", "phrase2", "phrase3"]
}`;

    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
    const article = JSON.parse(responseText);

    // Save to database
    await this.saveAIContent({
      contentType: 'article',
      content: article,
      model: 'claude-3.5-sonnet',
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
- Must be attention-grabbing and conversion-focused
- Use clear, action-oriented language

Return JSON only.`;

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
      model: 'claude-3-5-sonnet-20241022',
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
    const adCopy = JSON.parse(responseText);

    // Save to database
    await this.saveAIContent({
      contentType: 'ad_copy',
      content: adCopy,
      model: 'claude-3.5-sonnet',
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

Return JSON only.`;

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
      model: 'claude-3-5-sonnet-20241022',
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
    return JSON.parse(responseText);
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
