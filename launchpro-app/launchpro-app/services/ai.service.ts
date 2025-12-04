import Anthropic from '@anthropic-ai/sdk';
import { v1, helpers } from '@google-cloud/aiplatform';
import { Storage } from '@google-cloud/storage';
import { env } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getStorage } from '@/lib/gcs';

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
  country: string;
  language: string;
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

// UGC Style Prompt Configuration
interface UGCPromptParams {
  category: string;       // e.g., "Autos usados", "Préstamos personales"
  country: string;        // e.g., "Colombia", "México"
  language: string;       // e.g., "es", "en", "pt"
  adTitle: string;        // The ad headline/title (COPY for images)
  copyMaster: string;     // The copy master text (for videos)
}

// Country name mappings for prompts
const COUNTRY_NAMES: Record<string, string> = {
  'MX': 'México',
  'CO': 'Colombia',
  'AR': 'Argentina',
  'ES': 'España',
  'CL': 'Chile',
  'PE': 'Perú',
  'VE': 'Venezuela',
  'EC': 'Ecuador',
  'US': 'Estados Unidos',
  'BR': 'Brasil',
  'PT': 'Portugal',
  'UK': 'Reino Unido',
  'GB': 'Reino Unido',
};

// Language name mappings for prompts
const LANGUAGE_NAMES: Record<string, string> = {
  'es': 'español',
  'spanish': 'español',
  'en': 'inglés',
  'english': 'inglés',
  'pt': 'portugués',
  'portuguese': 'portugués',
};

/**
 * Generate UGC-style prompt for image generation
 * Creates authentic, lo-fi looking images that appear user-generated
 */
function buildUGCImagePrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  return `Una foto 1000x1000 cruda y espontánea estilo UGC de ${params.category} situada en un entorno auténtico de ${countryName}. La imagen debe tener calidad baja (lo-fi), pareciendo tomada con una cámara de celular barato antiguo o digital compacta de los 2000. Iluminación de flash directo y duro, ruido ISO alto visible, composición amateur y descentrada sin edición profesional. El fondo muestra arquitectura y caos cotidiano típico de ${countryName}. Superpuesto en la imagen, hay un texto grande y legible en ${languageName} que dice textualmente: "${params.adTitle}". El texto tiene estilo de sticker nativo de Instagram/TikTok. Estética realista, sin filtro de belleza.`;
}

/**
 * Generate UGC-style prompt for video generation
 * Creates authentic, amateur-looking videos that appear user-generated
 */
function buildUGCVideoPrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  return `Video vertical amateur formato 9:16. Una toma en primera persona (POV) o cámara en mano temblorosa de ${params.category} ocurriendo en una locación normal de ${countryName}. El metraje luce como contenido real de usuario (UGC) grabado con un celular Android de gama baja. Movimiento de cámara inestable, el autofoco pierde nitidez por momentos (hunting), iluminación natural pobre (ligeramente quemada o oscura). Sin corrección de color, colores lavados y realistas. Durante el video aparece un texto superpuesto en ${languageName} que dice: "${params.copyMaster}", integrado naturalmente como un caption de red social sobre el video.`;
}

/**
 * Generate prompt for video thumbnail (first frame style)
 * Creates an image that looks like a natural video thumbnail
 */
function buildVideoThumbnailPrompt(params: UGCPromptParams): string {
  const countryName = COUNTRY_NAMES[params.country] || params.country;
  const languageName = LANGUAGE_NAMES[params.language.toLowerCase()] || params.language;

  return `Una miniatura de video estilo UGC para ${params.category}. Captura de pantalla de un video amateur de ${countryName}, con un texto grande superpuesto en ${languageName} que dice: "${params.adTitle}". Estilo de thumbnail de TikTok/Instagram Reels con play button sutil. Calidad lo-fi, aspecto natural de screenshot de video vertical. El encuadre muestra el tema principal de forma llamativa pero amateur.`;
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

    // Initialize Google Cloud clients with proper credentials
    const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
    let vertexAiOptions: any = {
      apiEndpoint: `${env.GCP_LOCATION}-aiplatform.googleapis.com`,
    };

    if (credentialsJson) {
      try {
        const credentials = JSON.parse(credentialsJson);
        vertexAiOptions.credentials = credentials;
        vertexAiOptions.projectId = credentials.project_id;
        logger.info('ai', `Vertex AI initialized with service account: ${credentials.client_email}`);
      } catch (e: any) {
        logger.error('ai', `Failed to parse GCP_SERVICE_ACCOUNT_KEY: ${e.message}`);
      }
    } else {
      logger.warn('ai', 'GCP_SERVICE_ACCOUNT_KEY not found, using default credentials');
    }

    this.vertexAiClient = new PredictionServiceClient(vertexAiOptions);
    this.storage = getStorage();
  }

  // ============================================
  // TEXT GENERATION (Anthropic Claude)
  // ============================================

  /**
   * Generate Copy Master - the main communication angle aligned with the offer
   */
  async generateCopyMaster(params: GenerateCopyMasterParams): Promise<string> {
    // Determine the base language from the language parameter
    const lang = params.language.toLowerCase();
    const isEnglish = lang === 'en' || lang === 'english';
    const isPortuguese = lang === 'pt' || lang === 'portuguese';
    const isSpanish = lang === 'es' || lang === 'spanish' || (!isEnglish && !isPortuguese);

    // Map countries to their specific dialect rules (Spanish)
    const spanishDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms. Never use "vos" or Argentine forms.',
      'CO': 'Colombian Spanish: Use "tú/usted" forms. Formal and clear.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "querés", "podés").',
      'ES': 'European Spanish: Use "tú/vosotros" forms.',
      'CL': 'Chilean Spanish: Use "tú" forms.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms.',
      'VE': 'Venezuelan Spanish: Use "tú/usted" forms.',
      'EC': 'Ecuadorian Spanish: Use "tú/usted" forms.',
    };

    // English dialect rules
    const englishDialectRules: Record<string, string> = {
      'US': 'American English: Use US spelling (e.g., "color", "organize").',
      'UK': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'GB': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'AU': 'Australian English: Use Australian conventions.',
      'CA': 'Canadian English: Mix of US/UK spelling.',
    };

    // Portuguese dialect rules
    const portugueseDialectRules: Record<string, string> = {
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese.',
      'PT': 'European Portuguese: Use European Portuguese.',
    };

    // Determine the dialect rule based on language and country
    let dialectRule: string;
    let languageInstruction: string;

    if (isEnglish) {
      dialectRule = englishDialectRules[params.country] || 'American English: Use US spelling.';
      languageInstruction = 'WRITE IN ENGLISH.';
    } else if (isPortuguese) {
      dialectRule = portugueseDialectRules[params.country] || 'Brazilian Portuguese: Use standard Brazilian Portuguese.';
      languageInstruction = 'WRITE IN PORTUGUESE.';
    } else {
      // Default to Spanish
      dialectRule = spanishDialectRules[params.country] || 'Neutral Spanish: Use "tú/usted" forms.';
      languageInstruction = 'WRITE IN SPANISH.';
    }

    logger.info('ai', `Generating copy master in ${isEnglish ? 'English' : isPortuguese ? 'Portuguese' : 'Spanish'} for country ${params.country}`);

    const systemPrompt = `You are an expert digital marketing copywriter specialized in creating compelling copy masters for advertising campaigns.

A Copy Master is the central communication message that defines the angle and tone of an advertising campaign.

CRITICAL REQUIREMENTS:
- ${languageInstruction}
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

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ${dialectRule}

Generate a compelling Copy Master that:
- Is written ENTIRELY in ${isEnglish ? 'English' : isPortuguese ? 'Portuguese' : 'Spanish'}
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
   * Optimized for BOFU (Bottom of Funnel) transactional intent
   */
  async generateKeywords(params: GenerateKeywordsParams): Promise<string[]> {
    const count = 10; // Always generate 10 keywords

    // Map country codes to full names and regional context
    const countryContext: Record<string, { name: string; language: string; regionalNotes: string }> = {
      'MX': { name: 'México', language: 'Spanish (Mexican)', regionalNotes: 'Use Mexican Spanish terminology. Example: "carro" instead of "coche", "computadora" instead of "ordenador". Include city references like Ciudad de México, Guadalajara, Monterrey when relevant.' },
      'CO': { name: 'Colombia', language: 'Spanish (Colombian)', regionalNotes: 'Use Colombian Spanish terminology. Example: "carro" or "vehículo", "computador". Include city references like Bogotá, Medellín, Cali when relevant.' },
      'AR': { name: 'Argentina', language: 'Spanish (Argentine)', regionalNotes: 'Use Argentine Spanish terminology. Example: "auto", "computadora". Include city references like Buenos Aires, Córdoba, Rosario when relevant.' },
      'ES': { name: 'España', language: 'Spanish (European)', regionalNotes: 'Use European Spanish terminology. Example: "coche", "ordenador". Include city references like Madrid, Barcelona, Valencia when relevant.' },
      'CL': { name: 'Chile', language: 'Spanish (Chilean)', regionalNotes: 'Use Chilean Spanish terminology. Include city references like Santiago, Valparaíso, Concepción when relevant.' },
      'PE': { name: 'Perú', language: 'Spanish (Peruvian)', regionalNotes: 'Use Peruvian Spanish terminology. Include city references like Lima, Arequipa, Trujillo when relevant.' },
      'US': { name: 'United States', language: 'Spanish (US Latino) or English', regionalNotes: 'For Spanish: Use neutral Latin American Spanish. For English: Use American English. Can reference major cities like Miami, Los Angeles, Houston, New York.' },
      'BR': { name: 'Brasil', language: 'Portuguese (Brazilian)', regionalNotes: 'Use Brazilian Portuguese terminology. Include city references like São Paulo, Rio de Janeiro, Brasília when relevant.' },
    };

    const context = countryContext[params.country] || {
      name: params.country,
      language: 'Local language',
      regionalNotes: 'Adapt terminology to local market.'
    };

    const systemPrompt = `You are an expert in SEO Strategy, PPC, and Growth Hacking, specialized in compliance policies and regional semantic adaptation with a focus on transactional and financial intent keywords.

PRIMARY MISSION:
Generate a list of exactly 10 high-conversion keywords, 100% compliant and culturally adapted, focused on the bottom of the funnel (BOFU). Keywords must be aggressive, commercial, and click-attractive, prioritizing purchase intent, hiring, or financial comparison.

CONTEXT:
- Target Country: ${context.name}
- Language: ${context.language}
- Regional Adaptation: ${context.regionalNotes}

WORKFLOW DIRECTIVES:

🔹 Step 0 - Linguistic and Cultural Adaptation (PRIORITY)
- Identify synonyms, regionalisms, and colloquial terms specific to ${context.name}.
- Replace generic words with more natural and commercial local equivalents.
- ${context.regionalNotes}

🔹 Step 1 - Competitor Analysis
- Consider 2-3 relevant competitors in ${context.name}.
- Think about what transactional and financial keywords they use in their communication.

🔹 Step 2 - List Generation (10 Keywords)
Focus: maximum conversion intent, direct and commercial language.

MANDATORY COMPOSITION:
- Minimum 3 Direct Transactional Keywords → include verbs like: buy, hire, finance, quote, invest, price, payment (in the target language)
- Minimum 2 Specific Action Long-Tails → start with verb + clear benefit + 6-10 words. Can include city/country name when relevant for conversion.
- Remaining 5 Keywords: combination of:
  * Commercial Research (vs, alternatives, best options)
  * Decision Questions (how much does it cost, how to finance)
  * Financial Angles (credit, leasing, investment, monthly payments)

COMPLIANCE AND QUALITY RULES (MANDATORY):
- Total Relevance: each keyword must be directly linked to the niche/offer.
- No deception or false superlatives: exclude "free", "cheapest", "top deals", "guaranteed", "100%", etc.
- No false interactivity: avoid "search here" or "click now".
- Location references: use real city/state/country names only if it adds to conversion value.
- Estimated search volume: >70 monthly.
- Temporality: only use 2025 or 2026 if intentional and relevant.

CRITICAL OUTPUT FORMAT:
Return ONLY a valid JSON array with exactly 10 keywords. No markdown, no code blocks, no explanations, no numbering.
Example format: ["keyword 1", "keyword 2", "keyword 3", ...]`;

    const userPrompt = `Generate 10 high-conversion BOFU keywords for this advertising campaign:

OFFER: ${params.offerName}
COPY MASTER (Main Message): ${params.copyMaster}
TARGET COUNTRY: ${context.name}
LANGUAGE: ${context.language}

REMEMBER:
- ${context.regionalNotes}
- Minimum 3 transactional keywords with action verbs
- Minimum 2 long-tail keywords (6-10 words) with specific benefits
- 5 mixed keywords (comparisons, questions, financial terms)
- Use real city/country names from ${context.name} when it adds value
- Perfect spelling in ${context.language}
- NO false claims, NO "free", NO "guaranteed"

Return ONLY a JSON array: ["keyword1", "keyword2", ..., "keyword10"]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600, // Increased for 10 longer keywords (long-tails)
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
    let keywords = JSON.parse(cleanedResponse);

    // Ensure we always return exactly 10 keywords
    if (keywords.length > 10) {
      keywords = keywords.slice(0, 10);
    }

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
    // Determine the base language from the language parameter
    const lang = params.language.toLowerCase();
    const isEnglish = lang === 'en' || lang === 'english';
    const isPortuguese = lang === 'pt' || lang === 'portuguese';
    const isSpanish = lang === 'es' || lang === 'spanish' || (!isEnglish && !isPortuguese);

    // Map countries to their specific Spanish dialect rules
    const spanishDialectRules: Record<string, string> = {
      'MX': 'Mexican Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres", "puedes"). Never use "vos" or Argentine forms.',
      'CO': 'Colombian Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres", "puedes"). Formal and clear language.',
      'AR': 'Argentine Spanish: Use "vos" forms (e.g., "soñás", "querés", "podés"). Informal but professional tone.',
      'ES': 'European Spanish: Use "tú/vosotros" forms (e.g., "sueñas", "soñáis"). Use "vosotros" for plural informal.',
      'CL': 'Chilean Spanish: Use "tú" forms (e.g., "sueñas", "quieres"). Avoid excessive Chilean slang.',
      'PE': 'Peruvian Spanish: Use "tú/usted" forms (e.g., "sueñas", "quieres"). Formal and respectful.',
      'VE': 'Venezuelan Spanish: Use "tú/usted" forms. Formal and clear.',
      'EC': 'Ecuadorian Spanish: Use "tú/usted" forms. Formal and respectful.',
    };

    // English dialect rules
    const englishDialectRules: Record<string, string> = {
      'US': 'American English: Use US spelling (e.g., "color", "organize"). Clear, professional language.',
      'UK': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'GB': 'British English: Use UK spelling (e.g., "colour", "organise").',
      'AU': 'Australian English: Use Australian conventions.',
      'CA': 'Canadian English: Mix of US/UK spelling.',
    };

    // Portuguese dialect rules
    const portugueseDialectRules: Record<string, string> = {
      'BR': 'Brazilian Portuguese: Use standard Brazilian Portuguese conjugations.',
      'PT': 'European Portuguese: Use European Portuguese.',
    };

    // Determine the dialect rule based on language and country
    let dialectRule: string;
    let languageInstruction: string;
    let languageName: string;

    if (isEnglish) {
      dialectRule = englishDialectRules[params.country] || 'American English: Use US spelling.';
      languageInstruction = 'WRITE ENTIRELY IN ENGLISH.';
      languageName = 'English';
    } else if (isPortuguese) {
      dialectRule = portugueseDialectRules[params.country] || 'Brazilian Portuguese: Use standard Brazilian Portuguese.';
      languageInstruction = 'WRITE ENTIRELY IN PORTUGUESE.';
      languageName = 'Portuguese';
    } else {
      // Default to Spanish
      dialectRule = spanishDialectRules[params.country] || 'Neutral Spanish: Use "tú/usted" forms.';
      languageInstruction = 'WRITE ENTIRELY IN SPANISH.';
      languageName = 'Spanish';
    }

    logger.info('ai', `Generating article in ${languageName} for country ${params.country}`);

    const systemPrompt = `You are an expert content writer specialized in creating high-quality articles for native advertising that pass strict editorial review.

CRITICAL REQUIREMENTS (Article will be REJECTED if these are violated):

1. LANGUAGE & GRAMMAR:
   - ${languageInstruction}
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
Country: ${params.country}
Language: ${params.language}

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ${dialectRule}

ALL CONTENT (headline, teaser, contentGenerationPhrases) MUST BE IN ${languageName.toUpperCase()}.

REMEMBER:
- Perfect grammar and spelling
- NO invented data or exaggerated claims
- Formal/semi-formal tone only
- Truthful, valuable content
- CRITICAL: contentGenerationPhrases must be EXACTLY 3, 4, or 5 phrases (NOT 2, NOT 6, NOT 7!)

Return a JSON object with:
{
  "headline": "engaging headline in ${languageName} (max 256 characters)",
  "teaser": "compelling opening paragraph in ${languageName} (250-1000 characters)",
  "contentGenerationPhrases": ["phrase1 in ${languageName}", "phrase2", "phrase3", "phrase4"]
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
    // Determine the base language from the language parameter
    const lang = params.language.toLowerCase();
    const isEnglish = lang === 'en' || lang === 'english';
    const isPortuguese = lang === 'pt' || lang === 'portuguese';
    const isSpanish = lang === 'es' || lang === 'spanish' || (!isEnglish && !isPortuguese);

    let languageInstruction: string;
    let languageName: string;

    if (isEnglish) {
      languageInstruction = 'WRITE ENTIRELY IN ENGLISH.';
      languageName = 'English';
    } else if (isPortuguese) {
      languageInstruction = 'WRITE ENTIRELY IN PORTUGUESE.';
      languageName = 'Portuguese';
    } else {
      languageInstruction = 'WRITE ENTIRELY IN SPANISH.';
      languageName = 'Spanish';
    }

    logger.info('ai', `Generating ad copy in ${languageName} for ${params.platform}`);

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
- ${languageInstruction}
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
Country: ${params.country}
Language: ${params.language}
${params.targetAudience ? `Target Audience: ${params.targetAudience}` : ''}

CRITICAL LANGUAGE REQUIREMENT: ${languageInstruction} ALL ad copy text MUST be in ${languageName}.

Return JSON:
{
  "primaryText": "main ad text in ${languageName}",
  "headline": "compelling headline in ${languageName}",
  "description": "description text in ${languageName}",
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
   * Generate 5 Copy Master suggestions following CopyBot 7.1 RSOC compliance rules
   */
  async generateCopyMasterSuggestions(params: {
    offerName: string;
    offerDescription?: string;
    vertical?: string;
    country: string;
    language: string;
  }): Promise<string[]> {
    const systemPrompt = `Eres 'CopyBot 7.1', un creador, productor y estratega de contenido publicitario profesional y copywriter especializado en el ecosistema de Arbitraje de Búsqueda (Search Arbitrage - RSOC).

Tu misión: Crear copys para plataformas publicitarias como Meta Ads o TikTok que cumplan las políticas de monetización de Google AdSense y toda su Política de cumplimiento RAF. Tu objetivo es generar una "brecha de curiosidad" que impulse clics de alta intención de usuarios genuinamente interesados, buscando una conversión informada, sin una venta directa.

## 8 Políticas de Cumplimiento Obligatorio

Regla #1: Relevancia entre copys para Meta Ads, TikTok y copys de la landing page. Los copys que el usuario ve en el anuncio deben representar con precisión el contenido de la página de destino. Si el contenido de la landing de destino solo ofrece información, los copys solo pueden prometer información.

Regla #2: La Promesa es de contenido e informativa, NO Comercial o de venta.

Regla #3: Prohibido Afirmaciones Engañosas, Ambiguas, Deceptivas, Irreales o exageradas. Evita falsas promesas laborales, de salud o financieras, de crédito, ofertas, promociones. No hables en nombre de una empresa, marca o elementos que puedan confundirse con una marca oficial (Ejemplo: Samsung, TikTok, Apple).

Regla #4: Prohibido Clics Incentivados o Clickbait Manipulador. No ofrezcas recompensas por clics ni uses llamadas a la acción manipuladoras como: Toca aquí, compra aquí, pide gratis, reclámalo ahora.

Regla #5: Prohibido Contenido Inapropiado. Cero tolerancia con discursos de odio, violencia o contenido para adultos, drogas, armas, juegos de azar, político, discriminación, violencia, productos peligrosos, promesas falsas, antes/después, cannabis, ropa interior, disfunción eréctil, donación de óvulos, etc.

Regla #6: Palabras/términos/frases PROHIBIDAS - NO UTILIZAR:
- Términos de empleo: empleo, job
- Promesas de precio: gratis, oferta, promesas
- Términos de salud sensibles: cura, previene
- Términos financieros agresivos: garantizado, préstamo, inmediato, gratis
- Llamadas a la acción: Haz clic, Compra, clic aquí, Explora alternativas, ver precio, última hora, reclama ahora
- Comparaciones: comparar, comparaciones, antes y después
- Términos de cercanía: cerca de mí, en zona cercana
- Alternativas: alternativas, opciones
- Términos de tiempo: último minuto, rápido, hoy mismo

Regla #7: Call-to-actions PERMITIDOS (úsalos):
- "Aprende cómo..."
- "Lo que debería saber de..."
- "Descubre cómo..."
- "Aprende Más"
- "Más información"

## Ejemplos de Copys

❌ Prohibido: "Obtén préstamos en minutos"
✅ Permitido: "Aprende cómo es el proceso de solicitud de préstamos"

❌ Prohibido: "Estamos contratando choferes CDL hoy"
✅ Permitido: "Descubre cómo los conductores CDL construyen su carrera"

❌ Prohibido: "Teléfonos gratis para adultos mayores"
✅ Permitido: "Lo que debería saber sobre los programas de descuentos en teléfonos para adultos mayores"

## CTAs Prohibidos vs Permitidos
❌ Prohibidos: "Aplica ahora", "Reclama aquí", "Compra ya"
✅ Permitidos: "Aprende Más", "Más información"`;

    const userPrompt = `Genera exactamente 5 copys diferentes para el siguiente producto/oferta:

Oferta: ${params.offerName}
${params.offerDescription ? `Descripción: ${params.offerDescription}` : ''}
${params.vertical ? `Vertical: ${params.vertical}` : ''}
País objetivo: ${params.country}
Idioma: ${params.language}

Requisitos OBLIGATORIOS:
- Cada copy debe tener 2-3 oraciones máximo
- Debe generar curiosidad informativa, NO vender
- Usar CTAs permitidos (Aprende cómo, Descubre, Lo que debería saber, Más información)
- Ser culturalmente relevante para el país ${params.country}
- NO usar NINGUNA palabra prohibida de la lista
- Variar el enfoque/ángulo en cada sugerencia
- Gramática y ortografía perfecta en ${params.language}
- Tono formal o semi-formal

Responde SOLO con un JSON array de exactamente 5 strings, sin explicaciones ni markdown:
["copy1", "copy2", "copy3", "copy4", "copy5"]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
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
    let suggestions: string[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 5 suggestions
    if (suggestions.length > 5) {
      suggestions = suggestions.slice(0, 5);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'copy_master_suggestions',
      content: { suggestions },
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return suggestions;
  }

  /**
   * Generate 10 keyword suggestions following SEO Senior Specialist methodology
   * Distribution: 5 financial, 1 geographic, 2 need, 2 urgency
   */
  async generateKeywordsSuggestions(params: {
    category: string;
    country: string;
    language: string;
  }): Promise<{ keyword: string; type: string }[]> {
    const systemPrompt = `Actúa como un especialista Senior en SEO y Keyword Research. Tu tarea es generar una lista de 10 palabras clave (keywords) transaccionales y de navegación para la categoría especificada. Las keywords deben simular consultas orgánicas y naturales que los usuarios escriben en la barra de búsqueda de Google.

Debes seguir estrictamente la siguiente distribución para las 10 opciones:

1. (5 Keywords) Foco Financiero: Deben incluir términos relacionados con facilidades de pago, crédito o historial crediticio (ejemplos: "reportados en datacrédito", "pagar a cuotas", "sin cuota inicial", "crédito fácil").

2. (1 Keyword) Foco Geográfico: Debe incluir explícitamente el nombre de la ciudad más importante del país especificado dentro de la frase de búsqueda.

3. (2 Keywords) Foco en Necesidad: Deben abordar un problema, dolor o requerimiento específico que el usuario necesita solucionar con esta categoría.

4. (2 Keywords) Foco en Urgencia: Deben contener gatillos de tiempo que indiquen inmediatez (ejemplos: "para hoy", "entrega inmediata", "rápido", "urgente").

IMPORTANTE:
- Determina automáticamente la ciudad más importante del país (ej: Bogotá para Colombia, Ciudad de México para México, Lima para Perú, Madrid para España, etc.).
- Las keywords deben estar en el idioma especificado.
- Deben ser búsquedas realistas que un usuario haría en Google.`;

    const userPrompt = `Genera exactamente 10 keywords para:

Categoría: ${params.category}
País: ${params.country}
Idioma: ${params.language}

Responde SOLO con un JSON array de objetos con esta estructura exacta, sin explicaciones ni markdown:
[
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "financial"},
  {"keyword": "keyword aquí", "type": "geographic"},
  {"keyword": "keyword aquí", "type": "need"},
  {"keyword": "keyword aquí", "type": "need"},
  {"keyword": "keyword aquí", "type": "urgency"},
  {"keyword": "keyword aquí", "type": "urgency"}
]`;

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
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
    let suggestions: { keyword: string; type: string }[] = JSON.parse(cleanedResponse);

    // Ensure we have exactly 10 suggestions
    if (suggestions.length > 10) {
      suggestions = suggestions.slice(0, 10);
    }

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'keyword_suggestions',
      content: { suggestions },
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    return suggestions;
  }

  /**
   * Generate Ad Copy suggestions for Meta and TikTok ads
   * Meta: headline (40 chars), primaryText (125 chars), description (30 chars)
   * TikTok: adText (100 chars)
   */
  async generateAdCopySuggestions(params: {
    offerName: string;
    copyMaster: string;
    platform: 'META' | 'TIKTOK';
    country: string;
    language: string;
  }): Promise<{
    meta?: { headline: string; primaryText: string; description: string }[];
    tiktok?: { adText: string }[];
  }> {
    const systemPrompt = `Eres 'CopyBot 7.1', un creador y copywriter especializado en anuncios para ${params.platform === 'META' ? 'Meta Ads (Facebook/Instagram)' : 'TikTok Ads'} dentro del ecosistema de Arbitraje de Búsqueda (Search Arbitrage - RSOC).

Tu misión: Crear copys publicitarios que cumplan las políticas de monetización de Google AdSense y toda su Política de cumplimiento RAF. Tu objetivo es generar una "brecha de curiosidad" que impulse clics de alta intención de usuarios genuinamente interesados.

## 8 Políticas de Cumplimiento Obligatorio

Regla #1: Relevancia entre copys para Meta Ads, TikTok y copys de la landing page. Los copys que el usuario ve en el anuncio deben representar con precisión el contenido de la página de destino.

Regla #2: La Promesa es de contenido e informativa, NO Comercial o de venta.

Regla #3: Prohibido Afirmaciones Engañosas, Ambiguas, Deceptivas, Irreales o exageradas.

Regla #4: Prohibido Clics Incentivados o Clickbait Manipulador. No ofrezcas recompensas por clics ni uses llamadas a la acción manipuladoras.

Regla #5: Prohibido Contenido Inapropiado.

Regla #6: Palabras/términos/frases PROHIBIDAS - NO UTILIZAR:
- Términos de empleo: empleo, job
- Promesas de precio: gratis, oferta, promesas
- Términos de salud sensibles: cura, previene
- Términos financieros agresivos: garantizado, préstamo, inmediato, gratis
- Llamadas a la acción: Haz clic, Compra, clic aquí, ver precio, última hora, reclama ahora
- Comparaciones: comparar, antes y después
- Términos de cercanía: cerca de mí, en zona cercana
- Alternativas: alternativas, opciones

Regla #7: Call-to-actions PERMITIDOS:
- "Aprende cómo..."
- "Lo que debería saber de..."
- "Descubre cómo..."
- "Aprende Más"
- "Más información"

Regla #8: El contenido debe ser culturalmente relevante para ${params.country}.`;

    let userPrompt: string;

    if (params.platform === 'META') {
      userPrompt = `Genera exactamente 5 combinaciones de Ad Copy para Meta Ads basándote en:

Oferta: ${params.offerName}
Copy Master: ${params.copyMaster}
País: ${params.country}
Idioma: ${params.language}

Cada combinación debe incluir:
- headline: Título llamativo (máximo 40 caracteres)
- primaryText: Texto principal que genera curiosidad (máximo 125 caracteres)
- description: Descripción complementaria (máximo 30 caracteres)

IMPORTANTE:
- Respetar los límites de caracteres estrictamente
- Variar el enfoque/ángulo en cada combinación
- Usar CTAs permitidos
- Gramática perfecta en ${params.language}

Responde SOLO con un JSON array, sin explicaciones ni markdown:
[
  {"headline": "texto aquí", "primaryText": "texto aquí", "description": "texto aquí"},
  ...
]`;
    } else {
      userPrompt = `Genera exactamente 5 textos de Ad Copy para TikTok Ads basándote en:

Oferta: ${params.offerName}
Copy Master: ${params.copyMaster}
País: ${params.country}
Idioma: ${params.language}

Cada texto debe ser:
- adText: Texto del anuncio (máximo 100 caracteres)

IMPORTANTE:
- Respetar el límite de 100 caracteres estrictamente
- Tono casual y directo apropiado para TikTok
- Variar el enfoque en cada opción
- Usar CTAs permitidos
- Gramática correcta en ${params.language}

Responde SOLO con un JSON array, sin explicaciones ni markdown:
[
  {"adText": "texto aquí"},
  ...
]`;
    }

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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

    // Save to database for tracking
    await this.saveAIContent({
      contentType: 'ad_copy_suggestions',
      content: { platform: params.platform, suggestions: cleanedResponse },
      model: 'claude-sonnet-4',
      prompt: userPrompt,
      tokensUsed: message.usage.input_tokens + message.usage.output_tokens,
    });

    if (params.platform === 'META') {
      let suggestions: { headline: string; primaryText: string; description: string }[] = JSON.parse(cleanedResponse);
      if (suggestions.length > 5) {
        suggestions = suggestions.slice(0, 5);
      }
      return { meta: suggestions };
    } else {
      let suggestions: { adText: string }[] = JSON.parse(cleanedResponse);
      if (suggestions.length > 5) {
        suggestions = suggestions.slice(0, 5);
      }
      return { tiktok: suggestions };
    }
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

  // ============================================
  // UGC MEDIA GENERATION (Full workflow)
  // ============================================

  /**
   * Generate UGC-style media for campaigns
   * Handles images, videos, and video thumbnails based on platform requirements
   */
  async generateUGCMedia(params: {
    campaignId: string;
    platform: 'META' | 'TIKTOK';
    mediaType: 'IMAGE' | 'VIDEO' | 'BOTH';
    count: number;
    category: string;      // Offer vertical/category (e.g., "Autos usados")
    country: string;       // Country code (e.g., "CO", "MX")
    language: string;      // Language code (e.g., "es", "en")
    adTitle: string;       // Ad headline for text overlay
    copyMaster: string;    // Copy master for video text overlay
  }): Promise<{
    images: { url: string; gcsPath: string; prompt: string }[];
    videos: { url: string; gcsPath: string; prompt: string; thumbnailUrl?: string; thumbnailGcsPath?: string }[];
  }> {
    const results: {
      images: { url: string; gcsPath: string; prompt: string }[];
      videos: { url: string; gcsPath: string; prompt: string; thumbnailUrl?: string; thumbnailGcsPath?: string }[];
    } = {
      images: [],
      videos: [],
    };

    const ugcParams: UGCPromptParams = {
      category: params.category,
      country: params.country,
      language: params.language,
      adTitle: params.adTitle,
      copyMaster: params.copyMaster,
    };

    // DEBUG: Log para verificar el count recibido
    logger.info('ai', `📊 DEBUG: generateUGCMedia called with count=${params.count}, platform=${params.platform}, mediaType=${params.mediaType}`);

    // Determine what to generate based on platform and mediaType
    const shouldGenerateImages = params.platform === 'META' &&
      (params.mediaType === 'IMAGE' || params.mediaType === 'BOTH');
    const shouldGenerateVideos = params.mediaType === 'VIDEO' || params.mediaType === 'BOTH';

    // TikTok only allows videos
    if (params.platform === 'TIKTOK' && params.mediaType === 'IMAGE') {
      logger.warn('ai', 'TikTok does not allow image-only ads. Switching to VIDEO.');
    }

    // Generate images (only for Meta)
    if (shouldGenerateImages) {
      logger.info('ai', `Generating ${params.count} UGC image(s) for ${params.platform}...`);

      for (let i = 0; i < params.count; i++) {
        try {
          const imagePrompt = buildUGCImagePrompt(ugcParams);
          logger.info('ai', `Generating image ${i + 1}/${params.count}...`);

          const image = await this.generateImage({
            prompt: imagePrompt,
            aspectRatio: '1:1', // Square for Meta feed
          });

          results.images.push({
            url: image.imageUrl,
            gcsPath: image.gcsPath,
            prompt: imagePrompt,
          });

          logger.success('ai', `Image ${i + 1}/${params.count} generated successfully`);
        } catch (error: any) {
          logger.error('ai', `Failed to generate image ${i + 1}: ${error.message}`);
          throw error;
        }
      }
    }

    // Generate videos
    if (shouldGenerateVideos || params.platform === 'TIKTOK') {
      const videoCount = params.platform === 'TIKTOK' || !shouldGenerateImages ? params.count : params.count;
      logger.info('ai', `Generating ${videoCount} UGC video(s) for ${params.platform}...`);

      for (let i = 0; i < videoCount; i++) {
        try {
          const videoPrompt = buildUGCVideoPrompt(ugcParams);
          logger.info('ai', `Generating video ${i + 1}/${videoCount}...`);

          const video = await this.generateVideo({
            prompt: videoPrompt,
            aspectRatio: '9:16', // Vertical for both TikTok and Meta Reels
            durationSeconds: 5,  // Short form content
          });

          const videoResult: {
            url: string;
            gcsPath: string;
            prompt: string;
            thumbnailUrl?: string;
            thumbnailGcsPath?: string;
          } = {
            url: video.videoUrl,
            gcsPath: video.gcsPath,
            prompt: videoPrompt,
          };

          // Meta requires a thumbnail for video ads
          if (params.platform === 'META') {
            logger.info('ai', `Generating thumbnail for video ${i + 1}...`);

            const thumbnailPrompt = buildVideoThumbnailPrompt(ugcParams);
            const thumbnail = await this.generateImage({
              prompt: thumbnailPrompt,
              aspectRatio: '9:16', // Match video aspect ratio
            });

            videoResult.thumbnailUrl = thumbnail.imageUrl;
            videoResult.thumbnailGcsPath = thumbnail.gcsPath;
            logger.success('ai', `Thumbnail generated for video ${i + 1}`);
          }

          results.videos.push(videoResult);
          logger.success('ai', `Video ${i + 1}/${videoCount} generated successfully`);
        } catch (error: any) {
          logger.error('ai', `Failed to generate video ${i + 1}: ${error.message}`);
          throw error;
        }
      }
    }

    logger.success('ai', `UGC media generation complete: ${results.images.length} images, ${results.videos.length} videos`);
    return results;
  }

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
