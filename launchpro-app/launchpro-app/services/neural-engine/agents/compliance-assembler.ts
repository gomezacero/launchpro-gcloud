/**
 * RSOC Creative Neural Engine - Compliance Assembler
 *
 * Role: Deterministic Production Factory & Quality Control
 * Technology: Sharp (image processing) + Imagen 3 (generation)
 *
 * This is the final component that:
 * 1. Generates base images using Imagen 3
 * 2. Selects pre-approved Safe Copies (NEVER generates text with AI)
 * 3. Composites text onto images programmatically
 * 4. Uploads to Google Cloud Storage
 *
 * CRITICAL: This component guarantees 100% RSOC policy compliance
 * by separating AI generation from text insertion.
 */

import sharp from 'sharp';
import { v1, helpers } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { GoogleGenAI } from '@google/genai';
import { getStorage } from '@/lib/gcs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { join } from 'path';
import { readFileSync } from 'fs';
import {
  AssembledCreative,
  CreativePackage,
  GeneratedImage,
  VisualPrompt,
  StrategyBrief,
  RetrievedAssets,
  NeuralEngineInput,
  AgentError,
  ModelUsage,
} from '../types';

const { PredictionServiceClient } = v1;

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_NAME = 'ComplianceAssembler';
const IMAGE_MODEL = 'imagen-3.0-generate-001';
const GEMINI_MODEL = 'gemini-2.0-flash-exp'; // Fallback for when Imagen quota exceeded
const GCS_FOLDER = 'neural-engine/creatives';

// Load fonts for Satori text rendering
// These are embedded in the build so they work in Vercel serverless
let interBoldFont: ArrayBuffer | null = null;
let interRegularFont: ArrayBuffer | null = null;

function loadFonts(): { interBold: ArrayBuffer; interRegular: ArrayBuffer } {
  if (!interBoldFont || !interRegularFont) {
    try {
      // Try to load from lib/fonts directory
      const fontsDir = join(process.cwd(), 'lib', 'fonts');
      interBoldFont = readFileSync(join(fontsDir, 'Inter-Bold.woff')).buffer as ArrayBuffer;
      interRegularFont = readFileSync(join(fontsDir, 'Inter-Regular.woff')).buffer as ArrayBuffer;
      console.log(`[${AGENT_NAME}] ✅ Fonts loaded successfully from lib/fonts`);
    } catch (error: any) {
      console.warn(`[${AGENT_NAME}] ⚠️ Could not load fonts from lib/fonts:`, error.message);
      // Fallback: try node_modules location for development
      try {
        const altFontsDir = join(process.cwd(), 'launchpro-app', 'lib', 'fonts');
        interBoldFont = readFileSync(join(altFontsDir, 'Inter-Bold.woff')).buffer as ArrayBuffer;
        interRegularFont = readFileSync(join(altFontsDir, 'Inter-Regular.woff')).buffer as ArrayBuffer;
        console.log(`[${AGENT_NAME}] ✅ Fonts loaded successfully from launchpro-app/lib/fonts`);
      } catch (err: any) {
        console.error(`[${AGENT_NAME}] ❌ Failed to load fonts:`, err.message);
        throw new Error('Could not load fonts for text rendering');
      }
    }
  }
  return { interBold: interBoldFont!, interRegular: interRegularFont! };
}

// Text overlay configuration
const TEXT_CONFIG = {
  headline: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    shadowColor: '#000000',
    shadowBlur: 4,
    maxWidth: 0.9, // 90% of image width
    position: 'top', // top, center, bottom
    padding: 40,
  },
  cta: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: '#0066CC',
    borderRadius: 8,
    padding: 16,
    position: 'bottom',
  },
};

// ============================================================================
// COMPLIANCE ASSEMBLER
// ============================================================================

export class ComplianceAssembler {
  private predictionClient: any = null;
  private geminiClient: GoogleGenAI | null = null;
  private storage: Storage;
  private projectId: string;
  private location: string;
  private bucket: string;
  private credentials: any = null;

  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID || '';
    this.location = process.env.GCP_LOCATION || 'us-central1';
    this.bucket = process.env.GCP_STORAGE_BUCKET || '';

    // Parse credentials from environment (for Vercel)
    const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (credentialsJson) {
      try {
        this.credentials = JSON.parse(credentialsJson);
        console.log(`[${AGENT_NAME}] Using explicit GCP credentials for project: ${this.credentials.project_id}`);
      } catch (e: any) {
        console.warn(`[${AGENT_NAME}] Failed to parse GCP_SERVICE_ACCOUNT_KEY:`, e.message);
      }
    }

    this.storage = getStorage();

    // Initialize Gemini client for fallback image generation
    const geminiApiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      this.geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
      console.log(`[${AGENT_NAME}] Gemini fallback initialized`);
    } else {
      console.warn(`[${AGENT_NAME}] No Gemini API key - fallback disabled`);
    }

    if (!this.projectId || !this.bucket) {
      console.warn(`[${AGENT_NAME}] GCP configuration incomplete. Assembly may fail.`);
    }
  }

  /**
   * Get or create prediction client
   */
  private getPredictionClient(): any {
    if (!this.predictionClient) {
      const clientOptions: any = {
        apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
      };

      // Use explicit credentials if available (for Vercel deployment)
      if (this.credentials) {
        clientOptions.credentials = this.credentials;
        clientOptions.projectId = this.credentials.project_id || this.projectId;
      }

      this.predictionClient = new PredictionServiceClient(clientOptions);
    }
    return this.predictionClient;
  }

  /**
   * Execute the full assembly pipeline
   */
  async execute(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    visualPrompts: VisualPrompt[],
    retrievedAssets: RetrievedAssets
  ): Promise<{
    success: boolean;
    data?: CreativePackage;
    error?: AgentError;
    modelUsage: ModelUsage[];
    warning?: string;
  }> {
    const startTime = Date.now();
    const modelUsage: ModelUsage[] = [];
    let warning: string | undefined;

    // Check if text overlay should be included (default: true for backwards compatibility)
    const includeTextOverlay = input.includeTextOverlay !== false;

    console.log(`[${AGENT_NAME}] Starting creative assembly for ${input.offer.name}`);
    console.log(`[${AGENT_NAME}] 📝 Text overlay: ${includeTextOverlay ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[${AGENT_NAME}] 🎨 Visual style: ${input.visualStyle || 'photography'}`);

    try {
      // Step 1: Generate base images from prompts (with Gemini fallback if Imagen quota exceeded)
      const { images: generatedImages, quotaExceeded, usedFallback } = await this.generateImagesWithFallback(visualPrompts, modelUsage);

      // Step 2: Select appropriate Safe Copy
      const selectedCopy = this.selectSafeCopy(strategyBrief, retrievedAssets, input.customTextOverlay);

      let assembledImages: GeneratedImage[] = [];

      if (generatedImages.length > 0) {
        // Step 3: Composite text onto images ONLY if includeTextOverlay is true
        if (includeTextOverlay) {
          assembledImages = await this.compositeImages(
            generatedImages,
            selectedCopy,
            strategyBrief
          );
          console.log(`[${AGENT_NAME}] ✅ Text overlay applied to ${assembledImages.length} images`);
        } else {
          // No text overlay - return base images as-is
          assembledImages = generatedImages;
          console.log(`[${AGENT_NAME}] ✅ Returning ${assembledImages.length} images WITHOUT text overlay`);
        }

        // Add warning if we used fallback
        if (usedFallback) {
          warning = 'Imagen 3 quota exceeded - used Gemini fallback for image generation';
          console.log(`[${AGENT_NAME}] ℹ️ ${warning}`);
        }
      } else if (quotaExceeded) {
        warning = 'Image generation failed: Imagen 3 quota exceeded and Gemini fallback unavailable.';
        console.warn(`[${AGENT_NAME}] ${warning}`);
      }

      // Step 4: Build final creative package (works with or without images)
      const creativePackage = this.buildCreativePackage(
        input,
        strategyBrief,
        selectedCopy,
        assembledImages,
        modelUsage,
        startTime
      );

      const duration = Date.now() - startTime;
      console.log(`[${AGENT_NAME}] ✅ Assembly completed in ${duration}ms`, {
        imagesGenerated: generatedImages.length,
        imagesAssembled: assembledImages.length,
        quotaExceeded,
        usedFallback,
      });

      return { success: true, data: creativePackage, modelUsage, warning };
    } catch (error: any) {
      console.error(`[${AGENT_NAME}] Error:`, error.message);

      return {
        success: false,
        error: {
          agent: AGENT_NAME,
          error: error.message,
          code: 'ASSEMBLY_ERROR',
          timestamp: new Date(),
          recoverable: false,
        },
        modelUsage,
      };
    }
  }

  /**
   * Generate images with graceful fallback to Gemini when Imagen 3 quota exceeded
   */
  private async generateImagesWithFallback(
    prompts: VisualPrompt[],
    modelUsage: ModelUsage[]
  ): Promise<{ images: GeneratedImage[]; quotaExceeded: boolean; usedFallback: boolean }> {
    try {
      console.log(`[${AGENT_NAME}] 🖼️ Attempting image generation with Imagen 3...`);
      const images = await this.generateImages(prompts, modelUsage);
      return { images, quotaExceeded: false, usedFallback: false };
    } catch (error: any) {
      // Check if it's a quota error
      const isQuotaError =
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('Quota exceeded') ||
        error.code === 8 || // gRPC RESOURCE_EXHAUSTED code
        error.details?.includes('quota');

      if (isQuotaError) {
        console.warn(`[${AGENT_NAME}] ⚠️ Imagen 3 quota exceeded. Trying Gemini fallback...`);

        // Try Gemini fallback if available
        if (this.geminiClient) {
          try {
            const geminiImages = await this.generateImagesWithGemini(prompts, modelUsage);
            if (geminiImages.length > 0) {
              console.log(`[${AGENT_NAME}] ✅ Gemini fallback successful: ${geminiImages.length} images`);
              return { images: geminiImages, quotaExceeded: true, usedFallback: true };
            }
          } catch (geminiError: any) {
            console.error(`[${AGENT_NAME}] ❌ Gemini fallback also failed:`, geminiError.message);
          }
        } else {
          console.warn(`[${AGENT_NAME}] No Gemini client available for fallback`);
        }

        return { images: [], quotaExceeded: true, usedFallback: false };
      }

      // Re-throw non-quota errors
      throw error;
    }
  }

  /**
   * Generate images using Gemini (fallback for when Imagen 3 quota exceeded)
   */
  private async generateImagesWithGemini(
    prompts: VisualPrompt[],
    modelUsage: ModelUsage[]
  ): Promise<GeneratedImage[]> {
    if (!this.geminiClient) {
      throw new Error('Gemini client not initialized');
    }

    console.log(`[${AGENT_NAME}] 🔄 Generating images with Gemini ${GEMINI_MODEL}...`);
    const generatedImages: GeneratedImage[] = [];

    // Generate images for each prompt (limited to 4 for cost control)
    const promptsToProcess = prompts.slice(0, 4);

    for (let i = 0; i < promptsToProcess.length; i++) {
      const prompt = promptsToProcess[i];

      try {
        // Build enhanced prompt with strong style enforcement
        const styleInstruction = this.getStyleInstruction(prompt.style);
        const enhancedPrompt = `${styleInstruction}\n\n${prompt.prompt}\n\nIMPORTANT: Do NOT include any text, words, letters, logos, or watermarks in the image. The image should be clean for text overlay to be added later.`;

        console.log(`[${AGENT_NAME}] Generating image ${i + 1}/${promptsToProcess.length} with Gemini...`);
        console.log(`[${AGENT_NAME}] Style: ${prompt.style}`);
        console.log(`[${AGENT_NAME}] Prompt: ${enhancedPrompt.substring(0, 150)}...`);

        const startTime = Date.now();

        // Use Gemini API for image generation
        const response = await this.geminiClient.models.generateContent({
          model: GEMINI_MODEL,
          contents: enhancedPrompt,
          config: {
            responseModalities: ['image', 'text'],
          },
        });

        const latencyMs = Date.now() - startTime;

        // Extract image from response
        let imageBase64: string | undefined;
        let mimeType = 'image/png';

        if (response.candidates && response.candidates[0]?.content?.parts) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              imageBase64 = part.inlineData.data;
              mimeType = part.inlineData.mimeType || 'image/png';
              break;
            }
          }
        }

        if (!imageBase64) {
          console.warn(`[${AGENT_NAME}] No image generated from Gemini for prompt ${i + 1}`);
          continue;
        }

        // Upload to GCS
        const imageBuffer = Buffer.from(imageBase64, 'base64');
        const { width, height } = await this.getImageDimensions(imageBuffer);

        const imageId = `img-gemini-${Date.now()}-${i}`;
        const extension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const gcsPath = `${GCS_FOLDER}/${imageId}.${extension}`;
        const url = await this.uploadToGCS(imageBuffer, gcsPath);

        generatedImages.push({
          id: imageId,
          url,
          gcsPath,
          width,
          height,
          aspectRatio: prompt.aspectRatio,
          hasTextOverlay: false,
        });

        // Track model usage
        modelUsage.push({
          agent: AGENT_NAME,
          model: GEMINI_MODEL,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0.01, // Approximate cost per Gemini image
          latencyMs,
          fromCache: false,
        });

        console.log(`[${AGENT_NAME}] ✅ Gemini image ${i + 1} generated successfully (${latencyMs}ms)`);
      } catch (error: any) {
        console.error(`[${AGENT_NAME}] Error generating Gemini image ${i + 1}:`, error.message);
        // Continue with other images
      }
    }

    console.log(`[${AGENT_NAME}] Gemini generation complete. Generated ${generatedImages.length}/${promptsToProcess.length} images.`);
    return generatedImages;
  }

  /**
   * Generate base images using Imagen 3
   * Throws on quota errors to allow graceful fallback
   */
  private async generateImages(
    prompts: VisualPrompt[],
    modelUsage: ModelUsage[]
  ): Promise<GeneratedImage[]> {
    const client = this.getPredictionClient();
    const endpoint = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${IMAGE_MODEL}`;

    console.log(`[${AGENT_NAME}] Image generation config:`, {
      endpoint,
      projectId: this.projectId,
      location: this.location,
      model: IMAGE_MODEL,
      hasCredentials: !!this.credentials,
      promptCount: prompts.length,
    });

    const generatedImages: GeneratedImage[] = [];
    let quotaExceeded = false;

    // Generate images for each prompt (limited to 4 for cost control)
    const promptsToProcess = prompts.slice(0, 4);

    for (let i = 0; i < promptsToProcess.length; i++) {
      const prompt = promptsToProcess[i];

      try {
        // Enhance prompt with style instruction for better adherence
        const styleInstruction = this.getStyleInstruction(prompt.style);
        const enhancedPrompt = `${styleInstruction} ${prompt.prompt}`;

        console.log(`[${AGENT_NAME}] Generating image ${i + 1}/${promptsToProcess.length}...`);
        console.log(`[${AGENT_NAME}] Style: ${prompt.style}`);
        console.log(`[${AGENT_NAME}] Prompt: ${enhancedPrompt.substring(0, 150)}...`);

        const startTime = Date.now();

        // Build Imagen 3 request
        const instance = helpers.toValue({
          prompt: enhancedPrompt,
          negativePrompt: prompt.negativePrompt,
          aspectRatio: prompt.aspectRatio,
          sampleCount: 1,
          safetyFilterLevel: 'block_medium_and_above',
          personGeneration: 'allow_adult',
        });

        const [response] = await client.predict({
          endpoint,
          instances: [instance],
        });

        const latencyMs = Date.now() - startTime;

        // Extract image from response
        const predictions = response.predictions;
        if (!predictions || predictions.length === 0) {
          console.warn(`[${AGENT_NAME}] No image generated for prompt ${i + 1}`);
          continue;
        }

        const imageData = (predictions[0] as any).structValue?.fields;
        const base64Image = imageData?.bytesBase64Encoded?.stringValue;

        if (!base64Image) {
          console.warn(`[${AGENT_NAME}] No base64 image in response for prompt ${i + 1}`);
          continue;
        }

        // Upload to GCS
        const imageBuffer = Buffer.from(base64Image, 'base64');
        const { width, height } = await this.getImageDimensions(imageBuffer);

        const imageId = `img-${Date.now()}-${i}`;
        const gcsPath = `${GCS_FOLDER}/${imageId}.png`;
        const url = await this.uploadToGCS(imageBuffer, gcsPath);

        generatedImages.push({
          id: imageId,
          url,
          gcsPath,
          width,
          height,
          aspectRatio: prompt.aspectRatio,
          hasTextOverlay: false,
        });

        // Track model usage
        modelUsage.push({
          agent: AGENT_NAME,
          model: IMAGE_MODEL,
          inputTokens: 0, // N/A for image generation
          outputTokens: 0,
          cost: 0.02, // Approximate cost per image
          latencyMs,
          fromCache: false,
        });
      } catch (error: any) {
        console.error(`[${AGENT_NAME}] Error generating image ${i + 1}:`, error.message);
        console.error(`[${AGENT_NAME}] Error details:`, JSON.stringify({
          code: error.code,
          details: error.details,
          metadata: error.metadata,
          stack: error.stack?.substring(0, 500),
        }));

        // Check if it's a quota error - if so, stop and throw
        const isQuotaError =
          error.message?.includes('RESOURCE_EXHAUSTED') ||
          error.message?.includes('Quota exceeded') ||
          error.code === 8 || // gRPC RESOURCE_EXHAUSTED code
          error.details?.includes('quota');

        if (isQuotaError) {
          quotaExceeded = true;
          console.warn(`[${AGENT_NAME}] Quota exceeded - stopping image generation`);
          break; // Stop trying more images
        }
        // For other errors, continue with other images
      }
    }

    console.log(`[${AGENT_NAME}] Image generation complete. Generated ${generatedImages.length} images out of ${promptsToProcess.length} prompts.`);

    // If we got quota error and no images, throw to trigger fallback
    if (quotaExceeded && generatedImages.length === 0) {
      const quotaError = new Error('RESOURCE_EXHAUSTED: Quota exceeded for Imagen 3');
      (quotaError as any).code = 8;
      throw quotaError;
    }

    return generatedImages;
  }

  /**
   * Get image dimensions using Sharp
   */
  private async getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width || 1080,
        height: metadata.height || 1080,
      };
    } catch {
      return { width: 1080, height: 1080 };
    }
  }

  /**
   * Upload image to Google Cloud Storage and return a signed URL
   */
  private async uploadToGCS(buffer: Buffer, path: string): Promise<string> {
    const file = this.storage.bucket(this.bucket).file(path);

    await file.save(buffer, {
      contentType: 'image/png',
      // Don't set public: true - bucket uses uniform bucket-level access
      // Files are accessible via bucket IAM policies
    });

    // Generate a signed URL that expires in 7 days
    // This ensures the URL is accessible for campaign processing
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    console.log(`[ComplianceAssembler] ✅ Image uploaded to GCS with signed URL: ${path}`);

    return signedUrl;
  }

  /**
   * Select appropriate Safe Copy from retrieved assets
   * Supports custom text overlay when provided
   * Priority: customTextOverlay > strategyBrief.keyMessage > platformCopy > safeCopies
   */
  private selectSafeCopy(
    strategyBrief: StrategyBrief,
    retrievedAssets: RetrievedAssets,
    customTextOverlay?: string
  ): { headline: string; subheadline?: string; cta: string } {
    // If custom text overlay is provided, use it as the headline
    if (customTextOverlay) {
      console.log(`[${AGENT_NAME}] Using custom text overlay: "${customTextOverlay.substring(0, 50)}..."`);
      return {
        headline: customTextOverlay,
        subheadline: undefined,
        cta: 'Learn More',
      };
    }

    // Get platform adaptation
    const platformKey = Object.keys(strategyBrief.platformAdaptations)[0] || 'meta';
    const platformCopy = strategyBrief.platformAdaptations[platformKey as 'meta' | 'tiktok'];

    // Find CTA from safeCopies (these are usually fine)
    const safeCopies = retrievedAssets.safeCopies;
    const ctaCopy = safeCopies.find((c) => c.copyType === 'cta' && c.approved);

    // PRIORITY for headline:
    // 1. strategyBrief.keyMessage (AI-generated, campaign-specific)
    // 2. platformCopy.headline (platform-specific adaptation)
    // 3. safeCopies headline (generic templates)
    const headlineCopy = safeCopies.find((c) => c.copyType === 'headline' && c.approved);

    // Use keyMessage first as it's more relevant and personalized
    const selectedHeadline = strategyBrief.keyMessage || platformCopy?.headline || headlineCopy?.content || 'Discover More';
    const selectedCta = platformCopy?.callToAction || ctaCopy?.content || 'Learn More';

    console.log(`[${AGENT_NAME}] 📝 Selected headline: "${selectedHeadline}"`);
    console.log(`[${AGENT_NAME}] 📝 Selected CTA: "${selectedCta}"`);

    return {
      headline: selectedHeadline,
      subheadline: undefined, // Optional
      cta: selectedCta,
    };
  }

  /**
   * Composite text onto images using Sharp
   */
  private async compositeImages(
    images: GeneratedImage[],
    copy: { headline: string; subheadline?: string; cta: string },
    strategyBrief: StrategyBrief
  ): Promise<GeneratedImage[]> {
    const assembled: GeneratedImage[] = [];

    console.log(`[${AGENT_NAME}] 🎨 Starting text composite for ${images.length} images`);
    console.log(`[${AGENT_NAME}] 📝 Headline: "${copy.headline}"`);
    console.log(`[${AGENT_NAME}] 📝 CTA: "${copy.cta}"`);

    for (const image of images) {
      try {
        console.log(`[${AGENT_NAME}] Processing image: ${image.id}`);
        console.log(`[${AGENT_NAME}]   GCS Path: ${image.gcsPath}`);
        console.log(`[${AGENT_NAME}]   Dimensions: ${image.width}x${image.height}`);

        // Download image from GCS
        console.log(`[${AGENT_NAME}]   Downloading from GCS...`);
        const imageBuffer = await this.downloadFromGCS(image.gcsPath);
        console.log(`[${AGENT_NAME}]   ✅ Downloaded (${imageBuffer.length} bytes)`);

        // Create text overlay SVG
        console.log(`[${AGENT_NAME}]   Creating text overlay SVG...`);
        const overlayBuffer = await this.createTextOverlay(
          image.width,
          image.height,
          copy,
          strategyBrief
        );
        console.log(`[${AGENT_NAME}]   ✅ Overlay created (${overlayBuffer.length} bytes)`);

        // Composite the overlay onto the image
        console.log(`[${AGENT_NAME}]   Compositing with Sharp...`);
        const composited = await sharp(imageBuffer)
          .composite([{ input: overlayBuffer, gravity: 'center' }])
          .png()
          .toBuffer();
        console.log(`[${AGENT_NAME}]   ✅ Composite created (${composited.length} bytes)`);

        // Upload composited image
        const assembledId = `${image.id}-assembled`;
        const assembledPath = `${GCS_FOLDER}/${assembledId}.png`;
        console.log(`[${AGENT_NAME}]   Uploading to GCS: ${assembledPath}`);
        const url = await this.uploadToGCS(composited, assembledPath);
        console.log(`[${AGENT_NAME}]   ✅ Uploaded successfully`);

        assembled.push({
          id: assembledId,
          url,
          gcsPath: assembledPath,
          width: image.width,
          height: image.height,
          aspectRatio: image.aspectRatio,
          hasTextOverlay: true,
        });

        console.log(`[${AGENT_NAME}] ✅ Image ${image.id} composited successfully with text overlay`);
      } catch (error: any) {
        console.error(`[${AGENT_NAME}] ❌ Error compositing image ${image.id}:`);
        console.error(`[${AGENT_NAME}]   Error message: ${error.message}`);
        console.error(`[${AGENT_NAME}]   Error stack: ${error.stack?.substring(0, 500)}`);
        // Still include the original image without overlay
        assembled.push({ ...image, hasTextOverlay: false });
      }
    }

    console.log(`[${AGENT_NAME}] 🏁 Composite complete: ${assembled.filter(i => i.hasTextOverlay).length}/${assembled.length} images have text overlay`);

    return assembled;
  }

  /**
   * Download image from GCS
   */
  private async downloadFromGCS(path: string): Promise<Buffer> {
    const file = this.storage.bucket(this.bucket).file(path);
    const [buffer] = await file.download();
    return buffer;
  }

  /**
   * Create text overlay using Satori + Resvg
   * This approach embeds fonts directly and works in Vercel serverless
   *
   * Uses React-like JSX elements that Satori converts to SVG,
   * then Resvg renders to PNG with embedded fonts
   */
  private async createTextOverlay(
    width: number,
    height: number,
    copy: { headline: string; subheadline?: string; cta: string },
    strategyBrief: StrategyBrief
  ): Promise<Buffer> {
    // Get primary color from strategy
    const primaryColor = strategyBrief.colorPalette[0] || '#0066CC';

    // Truncate headline if too long to prevent overflow
    const maxHeadlineLength = 60;
    const headline = copy.headline.length > maxHeadlineLength
      ? copy.headline.substring(0, maxHeadlineLength - 3) + '...'
      : copy.headline;

    // Calculate responsive sizes based on image dimensions
    const headlineFontSize = Math.max(28, Math.min(56, Math.floor(width / 18)));
    const ctaFontSize = Math.max(16, Math.min(28, Math.floor(width / 35)));
    const padding = Math.floor(width * 0.06);

    console.log(`[${AGENT_NAME}]   Creating text overlay with Satori: ${width}x${height}`);
    console.log(`[${AGENT_NAME}]   Headline: "${headline.substring(0, 40)}..."`);
    console.log(`[${AGENT_NAME}]   CTA: "${copy.cta}"`);
    console.log(`[${AGENT_NAME}]   Font sizes - Headline: ${headlineFontSize}px, CTA: ${ctaFontSize}px`);

    try {
      // Load embedded fonts
      const { interBold, interRegular } = loadFonts();

      // Create the overlay layout using Satori's React-like elements
      // Satori uses a subset of CSS flexbox for layout
      const overlayElement = {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: '100%',
            height: '100%',
            padding: `${padding}px`,
          },
          children: [
            // Top gradient + headline section
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)',
                  padding: `${padding}px`,
                  borderRadius: '12px',
                },
                children: [
                  {
                    type: 'div',
                    props: {
                      style: {
                        color: 'white',
                        fontSize: `${headlineFontSize}px`,
                        fontWeight: 700,
                        fontFamily: 'Inter',
                        textAlign: 'center',
                        textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
                        lineHeight: 1.2,
                        maxWidth: '90%',
                      },
                      children: headline,
                    },
                  },
                ],
              },
            },
            // Spacer
            { type: 'div', props: { style: { flex: 1 } } },
            // Bottom gradient + CTA section
            {
              type: 'div',
              props: {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 100%)',
                  padding: `${padding}px`,
                  borderRadius: '12px',
                },
                children: [
                  // CTA Button
                  {
                    type: 'div',
                    props: {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: primaryColor,
                        color: 'white',
                        fontSize: `${ctaFontSize}px`,
                        fontWeight: 700,
                        fontFamily: 'Inter',
                        padding: `${Math.floor(ctaFontSize * 0.6)}px ${Math.floor(ctaFontSize * 1.5)}px`,
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                      },
                      children: copy.cta,
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      // Render with Satori to SVG
      const svg = await satori(overlayElement as any, {
        width,
        height,
        fonts: [
          {
            name: 'Inter',
            data: interBold,
            weight: 700,
            style: 'normal',
          },
          {
            name: 'Inter',
            data: interRegular,
            weight: 400,
            style: 'normal',
          },
        ],
      });

      console.log(`[${AGENT_NAME}]   ✅ Satori SVG generated (${svg.length} chars)`);

      // Convert SVG to PNG using Resvg
      const resvg = new Resvg(svg, {
        fitTo: {
          mode: 'width',
          value: width,
        },
      });

      const pngData = resvg.render();
      const pngBuffer = pngData.asPng();

      console.log(`[${AGENT_NAME}]   ✅ Text overlay created with Satori+Resvg (${pngBuffer.length} bytes)`);
      return Buffer.from(pngBuffer);
    } catch (error: any) {
      console.error(`[${AGENT_NAME}]   ❌ Satori text overlay creation failed: ${error.message}`);
      console.error(`[${AGENT_NAME}]   Error stack: ${error.stack?.substring(0, 500)}`);

      // Fallback: Create a simple gradient overlay without text using SVG
      // This is guaranteed to work as it doesn't need fonts
      const ctaButtonWidth = Math.min(Math.floor(width * 0.45), 280);
      const ctaButtonHeight = Math.min(Math.floor(height * 0.07), 55);

      const fallbackSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="topGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#000000;stop-opacity:0.7" />
            <stop offset="100%" style="stop-color:#000000;stop-opacity:0" />
          </linearGradient>
          <linearGradient id="bottomGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#000000;stop-opacity:0" />
            <stop offset="100%" style="stop-color:#000000;stop-opacity:0.7" />
          </linearGradient>
        </defs>
        <rect width="100%" height="30%" fill="url(#topGrad)" />
        <rect y="70%" width="100%" height="30%" fill="url(#bottomGrad)" />
        <rect x="${Math.floor((width - ctaButtonWidth) / 2)}" y="${height - ctaButtonHeight - padding}"
              width="${ctaButtonWidth}" height="${ctaButtonHeight}" rx="8" fill="${primaryColor}" opacity="0.9"/>
      </svg>`;

      return sharp(Buffer.from(fallbackSvg)).png().toBuffer();
    }
  }

  /**
   * Get style-specific instruction to prepend to image generation prompts
   * This ensures Gemini strongly adheres to the selected visual style
   */
  private getStyleInstruction(style: string): string {
    const styleInstructions: Record<string, string> = {
      'photorealistic': 'Generate a HIGH-QUALITY PHOTOREALISTIC image. The image should look like a real photograph taken with a professional camera. Use realistic lighting, authentic textures, and natural color tones.',

      'ugc': 'Generate a USER-GENERATED CONTENT style image. The image should look like it was taken on a smartphone by a real person - slightly imperfect framing, natural lighting, candid feel. NOT polished or professional looking.',

      'graphic_design': 'Generate a GRAPHIC DESIGN style image. Create a modern, eye-catching design with bold colors, geometric shapes, clean lines, and flat design elements. This should look like digital art or illustration, NOT a photograph.',

      'text_centric': 'Generate a MINIMALIST BACKGROUND image optimized for TEXT OVERLAY. Create a clean, simple background with solid colors, subtle gradients, or abstract patterns. LOTS of negative space. The background should SUPPORT text, not compete with it. DO NOT include people or complex scenes - just clean abstract or minimal design.',

      'editorial': 'Generate an EDITORIAL/MAGAZINE style photograph. High production value, polished but authentic lifestyle feel. Well-composed, professionally lit, but not stock-photo-like.',

      'minimalist': 'Generate a MINIMALIST style image. Clean, simple composition with one clear focal point. Lots of negative space. Elegant simplicity. Scandinavian design influence.',

      'illustration': 'Generate an ILLUSTRATION style image. Hand-drawn or digital illustration aesthetic, NOT a photograph. Artistic, stylized, with clear graphic elements.',
    };

    return styleInstructions[style] || styleInstructions['photorealistic'];
  }

  /**
   * Build the final creative package
   */
  private buildCreativePackage(
    input: NeuralEngineInput,
    strategyBrief: StrategyBrief,
    selectedCopy: { headline: string; subheadline?: string; cta: string },
    images: GeneratedImage[],
    modelUsage: ModelUsage[],
    startTime: number
  ): CreativePackage {
    const platformKey = Object.keys(strategyBrief.platformAdaptations)[0] || 'meta';
    const platformCopy = strategyBrief.platformAdaptations[platformKey as 'meta' | 'tiktok'];

    const totalCost = modelUsage.reduce((sum, m) => sum + m.cost, 0);
    const generationTimeMs = Date.now() - startTime;

    return {
      id: `creative-${Date.now()}`,
      generatedAt: new Date(),

      offerId: input.offer.id,
      country: input.country,
      platform: input.platform,

      copy: {
        copyMaster: strategyBrief.copyMaster,
        headline: selectedCopy.headline,
        primaryText: platformCopy?.primaryText || strategyBrief.emotionalHook,
        description: platformCopy?.description || strategyBrief.keyMessage,
        callToAction: selectedCopy.cta,
      },

      visuals: {
        images,
        videos: undefined, // Videos would be added in a separate phase
      },

      strategy: {
        angle: strategyBrief.primaryAngle,
        visualConcept: strategyBrief.visualConcept,
      },

      metadata: {
        cacheHits: [], // Populated by orchestrator
        modelsUsed: modelUsage,
        totalCost,
        generationTimeMs,
      },
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let complianceAssemblerInstance: ComplianceAssembler | null = null;

export function getComplianceAssembler(): ComplianceAssembler {
  if (!complianceAssemblerInstance) {
    complianceAssemblerInstance = new ComplianceAssembler();
  }
  return complianceAssemblerInstance;
}
