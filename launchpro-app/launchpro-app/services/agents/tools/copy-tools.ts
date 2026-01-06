/**
 * Copy Tools
 * 
 * Herramientas para generación y validación de copy.
 * Estas tools son usadas principalmente por el Copy Agent.
 */

import { Tool, ToolResult, AdCopy } from '../types';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const copyTools: Tool[] = [
  {
    name: 'generate_copy_master',
    description: `Generate the Copy Master - the central communication message for the campaign.
    The Copy Master is 2-3 sentences that define the core messaging angle.
    Use this AFTER you have analyzed the offer and decided on a communication angle.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'Name of the offer',
        },
        communication_angle: {
          type: 'object',
          description: 'The chosen communication angle from strategy',
        },
        target_audience: {
          type: 'string',
          description: 'Description of the target audience',
        },
        language: {
          type: 'string',
          description: 'Language code (en, es, pt)',
        },
        tone: {
          type: 'string',
          description: 'Desired tone (professional, friendly, urgent, etc.)',
        },
      },
      required: ['offer_name', 'communication_angle', 'language'],
    },
  },
  {
    name: 'generate_keywords',
    description: `Generate keywords for the Tonic campaign.
    Keywords should be 3-10 relevant terms that match the offer and copy master.
    These appear on the parking/landing page.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'Name of the offer',
        },
        copy_master: {
          type: 'string',
          description: 'The generated copy master',
        },
        vertical: {
          type: 'string',
          description: 'The offer vertical',
        },
        count: {
          type: 'number',
          description: 'Number of keywords to generate (3-10, default 6)',
        },
      },
      required: ['offer_name', 'copy_master', 'vertical'],
    },
  },
  {
    name: 'generate_rsoc_article',
    description: `Generate RSOC article content for Tonic.
    Returns headline (max 256 chars), teaser (250-1000 chars), and content generation phrases.
    This is the article that users see before clicking through.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'Name of the offer',
        },
        copy_master: {
          type: 'string',
          description: 'The copy master',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'The generated keywords',
        },
        language: {
          type: 'string',
          description: 'Language code',
        },
        angle_type: {
          type: 'string',
          description: 'The communication angle type',
        },
      },
      required: ['offer_name', 'copy_master', 'keywords', 'language'],
    },
  },
  {
    name: 'generate_ad_copy',
    description: `Generate ad copy for Meta or TikTok.
    Returns primary text, headline, description, and CTA.
    Platform-specific character limits are automatically applied.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'Name of the offer',
        },
        copy_master: {
          type: 'string',
          description: 'The copy master',
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
        variant: {
          type: 'string',
          description: 'Variant identifier (A, B, C, etc.)',
        },
      },
      required: ['offer_name', 'copy_master', 'platform', 'ad_format'],
    },
  },
  {
    name: 'validate_copy_compliance',
    description: `Validate generated copy against compliance rules.
    Returns a compliance score (0-100) and list of issues to fix.
    Use this after generating any copy to ensure it passes review.`,
    input_schema: {
      type: 'object',
      properties: {
        copy: {
          type: 'object',
          description: 'The copy to validate (any copy object)',
        },
        compliance_rules: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of compliance rules to check against',
        },
        platform: {
          type: 'string',
          description: 'Target platform for platform-specific rules',
        },
      },
      required: ['copy', 'compliance_rules'],
    },
  },
  {
    name: 'refine_copy',
    description: `Refine copy based on compliance issues or feedback.
    Takes the original copy and issues, returns improved version.
    Use this when validate_copy_compliance finds issues.`,
    input_schema: {
      type: 'object',
      properties: {
        original_copy: {
          type: 'object',
          description: 'The original copy that needs refinement',
        },
        issues: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of issues to address',
        },
        compliance_rules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Compliance rules to follow',
        },
      },
      required: ['original_copy', 'issues'],
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================

export async function handleGenerateCopyMaster(input: {
  offer_name: string;
  communication_angle: any;
  target_audience?: string;
  language: string;
  tone?: string;
}): Promise<ToolResult> {
  try {
    // Esta tool es especial - devuelve una "instrucción" para que
    // el agente use su capacidad de generación de texto
    // En lugar de llamar a otra API, le damos el framework
    
    const copyMasterGuidelines = {
      structure: 'The Copy Master should be 2-3 sentences that:',
      requirements: [
        '1. Open with the main benefit or hook',
        '2. Address a key pain point',
        '3. Include a subtle call to action or next step',
      ],
      angleSpecificTips: getAngleSpecificTips(input.communication_angle?.angleType),
      characterLimit: 300,
      language: input.language,
      tone: input.tone || 'professional yet approachable',
      
      // Ejemplos por tipo de ángulo
      examples: getCopyMasterExamples(input.communication_angle?.angleType),
    };
    
    return {
      success: true,
      data: {
        message: 'Use these guidelines to generate the Copy Master',
        guidelines: copyMasterGuidelines,
        input: input,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateKeywords(input: {
  offer_name: string;
  copy_master: string;
  vertical: string;
  count?: number;
}): Promise<ToolResult> {
  try {
    const count = Math.min(Math.max(input.count || 6, 3), 10);
    
    const keywordGuidelines = {
      count: count,
      requirements: [
        'Must be relevant to the offer',
        'Mix of broad and specific terms',
        'Include action-oriented keywords',
        'Consider search intent',
      ],
      verticalSpecificKeywords: getVerticalKeywords(input.vertical),
      tips: [
        'Include the offer category (e.g., "auto loans", "scholarships")',
        'Include action words (e.g., "apply", "compare", "find")',
        'Include benefit words (e.g., "save", "free", "fast")',
      ],
    };
    
    return {
      success: true,
      data: {
        message: 'Generate keywords following these guidelines',
        guidelines: keywordGuidelines,
        input: input,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateRSOCArticle(input: {
  offer_name: string;
  copy_master: string;
  keywords: string[];
  language: string;
  angle_type?: string;
}): Promise<ToolResult> {
  try {
    const articleGuidelines = {
      headline: {
        maxLength: 256,
        tips: [
          'Be specific, not vague',
          'Include a benefit or intrigue',
          'Avoid clickbait that doesn\'t deliver',
          'Match the article content',
        ],
      },
      teaser: {
        minLength: 250,
        maxLength: 1000,
        tips: [
          'Hook the reader in first sentence',
          'Expand on the headline\'s promise',
          'Build curiosity to continue reading',
          'Include relevant keywords naturally',
        ],
      },
      contentGenerationPhrases: {
        count: '3-5 phrases',
        tips: [
          'Each phrase should be a potential section topic',
          'Cover different aspects of the offer',
          'Include educational/informational angles',
          'One phrase should address common objections',
        ],
      },
      language: input.language,
    };
    
    return {
      success: true,
      data: {
        message: 'Generate RSOC article following these guidelines',
        guidelines: articleGuidelines,
        input: input,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGenerateAdCopy(input: {
  offer_name: string;
  copy_master: string;
  platform: 'META' | 'TIKTOK';
  ad_format: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  variant?: string;
}): Promise<ToolResult> {
  try {
    const platformSpecs = {
      META: {
        primaryText: { recommended: 125, max: 2200 },
        headline: { recommended: 40, max: 255 },
        description: { recommended: 30, max: 255 },
        ctas: ['LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'DOWNLOAD', 'GET_QUOTE', 'APPLY_NOW'],
        tips: [
          'Lead with the strongest benefit',
          'Use numbers when possible',
          'Create urgency without being pushy',
          'End with clear next step',
        ],
      },
      TIKTOK: {
        primaryText: { recommended: 100, max: 150 },
        headline: { recommended: 50, max: 100 },
        description: { recommended: 100, max: 999 },
        ctas: ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW'],
        tips: [
          'Be casual and conversational',
          'Sound like a real person, not a brand',
          'Use trending language if appropriate',
          'Keep it punchy and direct',
        ],
      },
    };
    
    const specs = platformSpecs[input.platform];
    
    return {
      success: true,
      data: {
        message: `Generate ${input.platform} ad copy following these specs`,
        specs: specs,
        format: input.ad_format,
        variant: input.variant || 'A',
        input: input,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleValidateCopyCompliance(input: {
  copy: any;
  compliance_rules: string[];
  platform?: string;
}): Promise<ToolResult> {
  try {
    const issues: string[] = [];
    let score = 100;
    
    // Check each rule
    const copyText = JSON.stringify(input.copy).toLowerCase();
    
    // Common compliance checks
    const checkPatterns = [
      { pattern: /guarantee|guaranteed/i, issue: 'Avoid using "guarantee" - replace with "may" or "could"', deduction: 15 },
      { pattern: /100%|always|never/i, issue: 'Avoid absolute terms - use "up to" or "typically"', deduction: 10 },
      { pattern: /free money|get rich|make \$\d+/i, issue: 'Avoid unrealistic income/money claims', deduction: 20 },
      { pattern: /facebook|instagram|tiktok/i, issue: 'Remove platform names from copy', deduction: 25 },
      { pattern: /click here|click now/i, issue: 'Avoid generic CTAs - be more specific', deduction: 5 },
    ];
    
    for (const check of checkPatterns) {
      if (check.pattern.test(copyText)) {
        issues.push(check.issue);
        score -= check.deduction;
      }
    }
    
    // Check character limits based on platform
    if (input.platform === 'META') {
      if (input.copy.primaryText?.length > 125) {
        issues.push(`Primary text exceeds recommended 125 chars (current: ${input.copy.primaryText.length})`);
        score -= 5;
      }
      if (input.copy.headline?.length > 40) {
        issues.push(`Headline exceeds recommended 40 chars (current: ${input.copy.headline.length})`);
        score -= 5;
      }
    }
    
    if (input.platform === 'TIKTOK') {
      if (input.copy.primaryText?.length > 100) {
        issues.push(`Primary text exceeds recommended 100 chars (current: ${input.copy.primaryText.length})`);
        score -= 5;
      }
    }
    
    score = Math.max(0, score);
    
    return {
      success: true,
      data: {
        score: score,
        passed: score >= 80,
        issues: issues,
        recommendations: issues.length > 0 
          ? 'Use the refine_copy tool to fix these issues'
          : 'Copy looks good!',
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleRefineCopy(input: {
  original_copy: any;
  issues: string[];
  compliance_rules?: string[];
}): Promise<ToolResult> {
  try {
    const refinementGuidelines = {
      originalCopy: input.original_copy,
      issuesToFix: input.issues,
      instructions: [
        'Address each issue while maintaining the core message',
        'Keep the same tone and style',
        'Ensure refined version is within character limits',
        'Re-check for any new compliance issues introduced',
      ],
    };
    
    return {
      success: true,
      data: {
        message: 'Refine the copy addressing these issues',
        guidelines: refinementGuidelines,
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
// HELPER FUNCTIONS
// ============================================

function getAngleSpecificTips(angleType: string): string[] {
  const tips: Record<string, string[]> = {
    emotional: [
      'Start with "Imagine..." or "What if..."',
      'Focus on feelings, not features',
      'Paint a picture of the transformed life',
    ],
    rational: [
      'Lead with specific numbers or statistics',
      'Use comparisons and contrasts',
      'Present logical benefits',
    ],
    urgency: [
      'Mention time limits or scarcity',
      'Use action verbs',
      'Create FOMO without being pushy',
    ],
    social_proof: [
      'Reference number of satisfied customers',
      'Imply a community or movement',
      'Use trust-building language',
    ],
    curiosity: [
      'Open with an intriguing question',
      'Hint at valuable information',
      'Create an information gap',
    ],
  };
  
  return tips[angleType] || tips['rational'];
}

function getCopyMasterExamples(angleType: string): string[] {
  const examples: Record<string, string[]> = {
    emotional: [
      'Imagine driving home in your dream car this weekend. No more waiting, no more wondering. Your approval could be just 60 seconds away.',
      'Your future doesn\'t have to be limited by your past. Thousands are discovering scholarship opportunities they never knew existed.',
    ],
    rational: [
      'The average driver overpays $400/year on car insurance. Compare rates from 10+ carriers in under 3 minutes and see how much you could save.',
      'With rates starting at 4.9% APR and approval decisions in minutes, getting the car you need has never been more straightforward.',
    ],
    urgency: [
      'Enrollment ends this week. Don\'t miss your chance to lock in 2024 rates before they increase.',
      'Limited spots available for this semester. See if you qualify for up to $5,000 in education grants.',
    ],
    social_proof: [
      'Join 50,000+ drivers who switched and saved. See why they rated us #1 for customer satisfaction.',
      'Over 2 million students have already found their perfect program. Discover yours in just 2 minutes.',
    ],
    curiosity: [
      'There\'s a reason most people pay too much for insurance. Find out what the companies don\'t want you to know.',
      'The scholarship secret that colleges won\'t tell you about. See if you\'re leaving money on the table.',
    ],
  };
  
  return examples[angleType] || examples['rational'];
}

function getVerticalKeywords(vertical: string): string[] {
  const keywords: Record<string, string[]> = {
    auto_loans: ['car financing', 'auto loans', 'low rates', 'quick approval', 'refinance', 'bad credit OK'],
    education: ['scholarships', 'online degree', 'financial aid', 'accredited', 'free application', 'grants'],
    insurance: ['save money', 'compare rates', 'free quote', 'best coverage', 'instant quote', 'switch and save'],
    health: ['Medicare', 'health benefits', 'coverage options', 'prescription savings', 'enrollment', 'eligible'],
  };
  
  return keywords[vertical] || ['learn more', 'get started', 'free quote', 'apply now'];
}

// ============================================
// EXPORT TOOL HANDLER MAP
// ============================================

export const copyToolHandlers = new Map<string, (input: any) => Promise<ToolResult>>([
  ['generate_copy_master', handleGenerateCopyMaster],
  ['generate_keywords', handleGenerateKeywords],
  ['generate_rsoc_article', handleGenerateRSOCArticle],
  ['generate_ad_copy', handleGenerateAdCopy],
  ['validate_copy_compliance', handleValidateCopyCompliance],
  ['refine_copy', handleRefineCopy],
]);
