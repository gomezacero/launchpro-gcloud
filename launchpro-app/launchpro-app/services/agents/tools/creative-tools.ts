/**
 * Creative Tools
 * 
 * Herramientas para generación de assets visuales.
 * Estas tools son usadas principalmente por el Creative Agent.
 */

import { Tool, ToolResult } from '../types';
import { aiService } from '../../ai.service';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const creativeTools: Tool[] = [
  {
    name: 'analyze_visual_needs',
    description: `Analyze what type of visuals are needed for the campaign.
    Returns recommendations for image style, video type, and creative direction.
    Use this first to understand what visuals to create.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'Name of the offer',
        },
        vertical: {
          type: 'string',
          description: 'The offer vertical',
        },
        platform: {
          type: 'string',
          enum: ['META', 'TIKTOK'],
          description: 'Target platform',
        },
        ad_format: {
          type: 'string',
          enum: ['IMAGE', 'VIDEO', 'CAROUSEL'],
          description: 'Ad format',
        },
        copy_master: {
          type: 'string',
          description: 'The copy master for context',
        },
        communication_angle: {
          type: 'string',
          description: 'The communication angle type',
        },
      },
      required: ['offer_name', 'vertical', 'platform', 'ad_format'],
    },
  },
  {
    name: 'generate_image_prompt',
    description: `Create an optimized prompt for AI image generation.
    Returns a detailed prompt optimized for Imagen 4 or similar models.
    Use this before calling generate_image.`,
    input_schema: {
      type: 'object',
      properties: {
        visual_concept: {
          type: 'string',
          description: 'Description of what the image should show',
        },
        vertical: {
          type: 'string',
          description: 'The offer vertical for context',
        },
        platform: {
          type: 'string',
          description: 'Target platform for size/style optimization',
        },
        style: {
          type: 'string',
          description: 'Visual style (photorealistic, illustration, minimalist, etc.)',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3'],
          description: 'Aspect ratio for the image',
        },
      },
      required: ['visual_concept', 'platform', 'aspect_ratio'],
    },
  },
  {
    name: 'generate_image',
    description: `Generate an image using Vertex AI Imagen 4.
    Takes an optimized prompt and creates the actual image.
    Returns the image URL and GCS path.`,
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The optimized image prompt',
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid in the image',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['1:1', '16:9', '9:16', '4:3'],
          description: 'Aspect ratio',
        },
      },
      required: ['prompt', 'aspect_ratio'],
    },
  },
  {
    name: 'generate_video_prompt',
    description: `Create an optimized prompt for AI video generation.
    Returns a detailed prompt optimized for Veo 3.1 or similar models.
    Use this before calling generate_video.`,
    input_schema: {
      type: 'object',
      properties: {
        video_concept: {
          type: 'string',
          description: 'Description of what the video should show',
        },
        vertical: {
          type: 'string',
          description: 'The offer vertical for context',
        },
        platform: {
          type: 'string',
          description: 'Target platform',
        },
        duration_seconds: {
          type: 'number',
          description: 'Video duration (1-8 seconds)',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1'],
          description: 'Aspect ratio',
        },
      },
      required: ['video_concept', 'platform', 'duration_seconds', 'aspect_ratio'],
    },
  },
  {
    name: 'generate_video',
    description: `Generate a video using Vertex AI Veo 3.1.
    Takes an optimized prompt and creates the actual video.
    Returns the video URL and GCS path.`,
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The optimized video prompt',
        },
        duration_seconds: {
          type: 'number',
          description: 'Video duration (1-8 seconds)',
        },
        aspect_ratio: {
          type: 'string',
          enum: ['16:9', '9:16', '1:1'],
          description: 'Aspect ratio',
        },
        from_image_url: {
          type: 'string',
          description: 'Optional: Generate video from this image',
        },
      },
      required: ['prompt', 'duration_seconds', 'aspect_ratio'],
    },
  },
  {
    name: 'evaluate_creative',
    description: `Evaluate generated creative against best practices.
    Returns a score and suggestions for improvement.
    Use this after generating any creative to ensure quality.`,
    input_schema: {
      type: 'object',
      properties: {
        creative_type: {
          type: 'string',
          enum: ['IMAGE', 'VIDEO'],
          description: 'Type of creative',
        },
        prompt_used: {
          type: 'string',
          description: 'The prompt that was used',
        },
        platform: {
          type: 'string',
          description: 'Target platform',
        },
        vertical: {
          type: 'string',
          description: 'The offer vertical',
        },
      },
      required: ['creative_type', 'prompt_used', 'platform'],
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================

export async function handleAnalyzeVisualNeeds(input: {
  offer_name: string;
  vertical: string;
  platform: 'META' | 'TIKTOK';
  ad_format: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  copy_master?: string;
  communication_angle?: string;
}): Promise<ToolResult> {
  try {
    // Platform-specific recommendations
    const platformRecommendations = {
      META: {
        preferredFormats: ['IMAGE', 'CAROUSEL', 'VIDEO'],
        aspectRatios: {
          feed: '1:1',
          stories: '9:16',
          reels: '9:16',
        },
        styleTips: [
          'Clean, professional imagery works best',
          'Lifestyle shots outperform product-only',
          'Faces increase engagement',
          'Bright, contrasting colors stand out',
          'Text overlay should be minimal (20% rule)',
        ],
        videoTips: [
          'Hook in first 3 seconds',
          '15-30 seconds optimal for feed',
          '< 15 seconds for stories/reels',
          'Caption for sound-off viewing',
        ],
      },
      TIKTOK: {
        preferredFormats: ['VIDEO', 'IMAGE'],
        aspectRatios: {
          feed: '9:16',
          spark: '9:16',
        },
        styleTips: [
          'Native, authentic look outperforms polished',
          'UGC-style content resonates best',
          'Trending formats increase reach',
          'Fast-paced editing',
          'Strong visual hook immediately',
        ],
        videoTips: [
          'First frame is critical',
          '15-60 seconds optimal',
          'Sound-on assumed',
          'Text overlays for key messages',
        ],
      },
    };
    
    // Vertical-specific visual styles
    const verticalStyles: Record<string, any> = {
      auto_loans: {
        subjects: ['Cars', 'Keys', 'Happy drivers', 'Road/freedom imagery'],
        colors: ['Blue (trust)', 'Silver (modern)', 'Green (go/approved)'],
        avoid: ['Luxury excess', 'Negative imagery', 'Complex finance visuals'],
        mood: 'Aspirational but achievable',
      },
      education: {
        subjects: ['Graduation caps', 'Students', 'Laptops', 'Campus/learning'],
        colors: ['Blue (knowledge)', 'Green (growth)', 'Gold (achievement)'],
        avoid: ['Boring classroom shots', 'Stock photo look'],
        mood: 'Inspiring, transformational',
      },
      insurance: {
        subjects: ['Families', 'Homes', 'Protection imagery', 'Peace of mind'],
        colors: ['Blue (trust)', 'Green (savings)', 'Warm tones (family)'],
        avoid: ['Disaster imagery', 'Fear-based visuals'],
        mood: 'Reassuring, protective',
      },
      health: {
        subjects: ['Active seniors', 'Healthcare', 'Wellness', 'Families'],
        colors: ['Blue (medical)', 'Green (health)', 'Warm/calming tones'],
        avoid: ['Clinical/hospital focus', 'Sick people'],
        mood: 'Healthy, vibrant, hopeful',
      },
    };
    
    const platformRecs = platformRecommendations[input.platform];
    const verticalStyle = verticalStyles[input.vertical] || verticalStyles['insurance'];
    
    // Determine recommended aspect ratio based on format
    let recommendedAspectRatio = '1:1';
    if (input.platform === 'TIKTOK') {
      recommendedAspectRatio = '9:16';
    } else if (input.ad_format === 'VIDEO') {
      recommendedAspectRatio = '9:16'; // For Reels/Stories
    }
    
    return {
      success: true,
      data: {
        recommendation: {
          format: input.ad_format,
          aspectRatio: recommendedAspectRatio,
          style: verticalStyle.mood,
        },
        visualElements: {
          suggestedSubjects: verticalStyle.subjects,
          colorPalette: verticalStyle.colors,
          thingsToAvoid: verticalStyle.avoid,
        },
        platformGuidelines: {
          styleTips: platformRecs.styleTips,
          videoTips: input.ad_format === 'VIDEO' ? platformRecs.videoTips : undefined,
        },
        creativeDirection: `Create ${input.ad_format.toLowerCase()} content that feels ${verticalStyle.mood}. 
          Focus on ${verticalStyle.subjects.slice(0, 2).join(' and ')}. 
          Use ${verticalStyle.colors.slice(0, 2).join(' and ')} tones.`,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateImagePrompt(input: {
  visual_concept: string;
  vertical?: string;
  platform: string;
  style?: string;
  aspect_ratio: string;
}): Promise<ToolResult> {
  try {
    // Build optimized prompt structure
    const styleKeywords = {
      photorealistic: 'hyperrealistic photograph, professional photography, high resolution, sharp focus',
      illustration: 'digital illustration, clean lines, modern design, vector-style',
      minimalist: 'minimalist design, clean, simple, lots of white space, modern',
      lifestyle: 'lifestyle photography, candid, natural lighting, authentic',
      corporate: 'corporate photography, professional, business setting, clean background',
    };
    
    const platformOptimizations = {
      META: 'optimized for social media, eye-catching, scroll-stopping, vibrant colors',
      TIKTOK: 'trendy, authentic look, not overly polished, relatable, mobile-first',
    };
    
    const style = input.style || 'photorealistic';
    const styleModifiers = styleKeywords[style as keyof typeof styleKeywords] || styleKeywords['photorealistic'];
    const platformMods = platformOptimizations[input.platform as keyof typeof platformOptimizations] || '';
    
    // Negative prompt for common issues
    const negativePrompt = [
      'text',
      'watermark',
      'logo',
      'blurry',
      'low quality',
      'distorted faces',
      'extra limbs',
      'bad anatomy',
      'ugly',
      'deformed',
      'disfigured',
    ].join(', ');
    
    // Construct the optimized prompt
    const optimizedPrompt = `${input.visual_concept}. ${styleModifiers}. ${platformMods}. 
    Professional advertising quality, suitable for paid social media ads.
    Aspect ratio: ${input.aspect_ratio}.`;
    
    return {
      success: true,
      data: {
        optimizedPrompt: optimizedPrompt.trim().replace(/\s+/g, ' '),
        negativePrompt: negativePrompt,
        aspectRatio: input.aspect_ratio,
        tips: [
          'Review the prompt and adjust specifics if needed',
          'Consider adding specific color requirements',
          'Add demographic details if showing people',
        ],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateImage(input: {
  prompt: string;
  negative_prompt?: string;
  aspect_ratio: '1:1' | '16:9' | '9:16' | '4:3';
}): Promise<ToolResult> {
  try {
    // Call the actual image generation service
    const result = await aiService.generateImage({
      prompt: input.prompt,
      aspectRatio: input.aspect_ratio,
      negativePrompt: input.negative_prompt,
    });
    
    return {
      success: true,
      data: {
        imageUrl: result.imageUrl,
        gcsPath: result.gcsPath,
        prompt: input.prompt,
        aspectRatio: input.aspect_ratio,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Image generation failed: ${error.message}`,
    };
  }
}

export async function handleGenerateVideoPrompt(input: {
  video_concept: string;
  vertical?: string;
  platform: string;
  duration_seconds: number;
  aspect_ratio: string;
}): Promise<ToolResult> {
  try {
    // Video-specific prompt optimizations
    const platformStyles = {
      META: {
        style: 'cinematic, professional quality, smooth camera movement',
        pacing: 'medium paced, visually engaging',
        tips: 'Strong opening shot, clear visual story',
      },
      TIKTOK: {
        style: 'dynamic, trendy, fast-paced editing feel',
        pacing: 'quick cuts, energetic, attention-grabbing',
        tips: 'Hook in first frame, native platform feel',
      },
    };
    
    const platformStyle = platformStyles[input.platform as keyof typeof platformStyles] || platformStyles['META'];
    
    // Duration-specific guidance
    let durationGuidance = '';
    if (input.duration_seconds <= 3) {
      durationGuidance = 'Very short loop, single powerful visual moment';
    } else if (input.duration_seconds <= 5) {
      durationGuidance = 'Quick visual story, 1-2 scene changes maximum';
    } else {
      durationGuidance = 'Can include brief narrative arc, 2-3 scenes';
    }
    
    const optimizedPrompt = `${input.video_concept}. ${platformStyle.style}. ${platformStyle.pacing}. 
    ${durationGuidance}. Duration: ${input.duration_seconds} seconds. Aspect ratio: ${input.aspect_ratio}.
    Professional advertising quality video.`;
    
    return {
      success: true,
      data: {
        optimizedPrompt: optimizedPrompt.trim().replace(/\s+/g, ' '),
        durationSeconds: input.duration_seconds,
        aspectRatio: input.aspect_ratio,
        platformTips: platformStyle.tips,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateVideo(input: {
  prompt: string;
  duration_seconds: number;
  aspect_ratio: '16:9' | '9:16' | '1:1';
  from_image_url?: string;
}): Promise<ToolResult> {
  try {
    // Call the actual video generation service
    const result = await aiService.generateVideo({
      prompt: input.prompt,
      durationSeconds: input.duration_seconds,
      aspectRatio: input.aspect_ratio,
      fromImageUrl: input.from_image_url,
    });
    
    return {
      success: true,
      data: {
        videoUrl: result.videoUrl,
        gcsPath: result.gcsPath,
        prompt: input.prompt,
        durationSeconds: input.duration_seconds,
        aspectRatio: input.aspect_ratio,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Video generation failed: ${error.message}`,
    };
  }
}

export async function handleEvaluateCreative(input: {
  creative_type: 'IMAGE' | 'VIDEO';
  prompt_used: string;
  platform: string;
  vertical?: string;
}): Promise<ToolResult> {
  try {
    // Evaluate the prompt/creative against best practices
    const issues: string[] = [];
    let score = 100;
    
    const prompt = input.prompt_used.toLowerCase();
    
    // Check for common issues
    if (prompt.length < 50) {
      issues.push('Prompt is too short - add more descriptive details');
      score -= 15;
    }
    
    if (!prompt.includes('professional') && !prompt.includes('quality')) {
      issues.push('Consider adding quality modifiers (professional, high quality, etc.)');
      score -= 5;
    }
    
    if (prompt.includes('text') || prompt.includes('words') || prompt.includes('logo')) {
      issues.push('Avoid requesting text/logos in AI-generated images - add separately');
      score -= 10;
    }
    
    // Platform-specific checks
    if (input.platform === 'TIKTOK' && prompt.includes('corporate')) {
      issues.push('TikTok favors authentic/native look over corporate style');
      score -= 10;
    }
    
    // Positive signals
    const positiveSignals = [
      'lighting', 'composition', 'background', 'mood', 'style',
      'realistic', 'professional', 'advertising', 'social media'
    ];
    
    const foundSignals = positiveSignals.filter(s => prompt.includes(s));
    if (foundSignals.length >= 3) {
      score = Math.min(100, score + 10);
    }
    
    return {
      success: true,
      data: {
        score: Math.max(0, score),
        passed: score >= 70,
        issues: issues,
        positiveElements: foundSignals.length > 0 
          ? `Good use of: ${foundSignals.join(', ')}`
          : 'Consider adding more descriptive elements',
        recommendation: score >= 70 
          ? 'Prompt looks good for generation'
          : 'Consider revising prompt before generating',
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ============================================
// EXPORT TOOL HANDLER MAP
// ============================================

export const creativeToolHandlers = new Map<string, (input: any) => Promise<ToolResult>>([
  ['analyze_visual_needs', handleAnalyzeVisualNeeds],
  ['generate_image_prompt', handleGenerateImagePrompt],
  ['generate_image', handleGenerateImage],
  ['generate_video_prompt', handleGenerateVideoPrompt],
  ['generate_video', handleGenerateVideo],
  ['evaluate_creative', handleEvaluateCreative],
]);
