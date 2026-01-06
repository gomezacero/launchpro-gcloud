/**
 * Research Tools
 * 
 * Herramientas para investigar ofertas, verticales y mercados.
 * Estas tools son usadas principalmente por el Strategy Agent.
 */

import { Tool, ToolResult, VERTICAL_CONFIGS, VerticalConfig } from '../types';
import { tonicService } from '../../tonic.service';

// ============================================
// TOOL DEFINITIONS
// ============================================

export const researchTools: Tool[] = [
  {
    name: 'analyze_offer',
    description: `Analyze an offer to understand its value proposition, target audience, and key selling points.
    Use this tool when you need to deeply understand what the offer is about before creating content.
    Returns detailed analysis including main benefits, pain points addressed, and unique selling propositions.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_name: {
          type: 'string',
          description: 'The name of the offer to analyze',
        },
        offer_description: {
          type: 'string',
          description: 'Description of the offer (optional)',
        },
        vertical: {
          type: 'string',
          description: 'The vertical/industry of the offer (e.g., auto_loans, education, insurance)',
        },
        country: {
          type: 'string',
          description: 'Target country code (e.g., US, MX, BR)',
        },
      },
      required: ['offer_name', 'vertical'],
    },
  },
  {
    name: 'get_vertical_config',
    description: `Get the configuration and best practices for a specific vertical.
    Returns guidelines for tone, compliance rules, visual style, example copies, and recommended angles.
    Use this to ensure content aligns with industry best practices.`,
    input_schema: {
      type: 'object',
      properties: {
        vertical: {
          type: 'string',
          description: 'The vertical to get config for (auto_loans, education, insurance, health, default)',
        },
      },
      required: ['vertical'],
    },
  },
  {
    name: 'get_tonic_compliance_rules',
    description: `Get compliance rules from Tonic for a specific campaign type.
    Returns rules that MUST be followed to avoid ad rejection.
    Use this before finalizing any copy or creative.`,
    input_schema: {
      type: 'object',
      properties: {
        campaign_type: {
          type: 'string',
          description: 'The campaign type (display or rsoc)',
        },
        platform: {
          type: 'string',
          description: 'Target platform (META or TIKTOK)',
        },
      },
      required: ['campaign_type', 'platform'],
    },
  },
  {
    name: 'get_country_insights',
    description: `Get market insights for a specific country.
    Returns cultural considerations, language nuances, and market-specific recommendations.
    Use this to tailor content for the target market.`,
    input_schema: {
      type: 'object',
      properties: {
        country: {
          type: 'string',
          description: 'Country code (e.g., US, MX, BR, ES)',
        },
        vertical: {
          type: 'string',
          description: 'The vertical for context',
        },
      },
      required: ['country'],
    },
  },
  {
    name: 'suggest_communication_angle',
    description: `Suggest the best communication angle based on offer analysis.
    Returns recommended angles with reasoning, ranked by effectiveness.
    Use this after analyzing the offer to decide on messaging strategy.`,
    input_schema: {
      type: 'object',
      properties: {
        offer_analysis: {
          type: 'object',
          description: 'The offer analysis object from analyze_offer tool',
        },
        vertical_config: {
          type: 'object',
          description: 'The vertical config object from get_vertical_config tool',
        },
        country: {
          type: 'string',
          description: 'Target country',
        },
        platform: {
          type: 'string',
          description: 'Target platform (META or TIKTOK)',
        },
      },
      required: ['offer_analysis', 'vertical_config', 'platform'],
    },
  },
];

// ============================================
// TOOL HANDLERS
// ============================================

export async function handleAnalyzeOffer(input: {
  offer_name: string;
  offer_description?: string;
  vertical: string;
  country?: string;
}): Promise<ToolResult> {
  try {
    // Get vertical config for context
    const verticalConfig = VERTICAL_CONFIGS[input.vertical] || VERTICAL_CONFIGS['default'];
    
    // Analyze the offer based on vertical knowledge
    const analysis = {
      offerName: input.offer_name,
      vertical: input.vertical,
      verticalCategory: verticalConfig.name,
      
      // Inferred from vertical + offer name
      mainBenefit: inferMainBenefit(input.offer_name, verticalConfig),
      painPoints: inferPainPoints(input.vertical, verticalConfig),
      uniqueSellingPoints: inferUSPs(input.offer_name, verticalConfig),
      targetDemographic: inferTargetDemographic(input.vertical, input.country),
      
      // Vertical-specific insights
      recommendedKeywords: verticalConfig.keywords,
      recommendedAngles: verticalConfig.angles,
      
      // Compliance notes
      complianceNotes: verticalConfig.complianceRules,
    };
    
    return {
      success: true,
      data: analysis,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGetVerticalConfig(input: {
  vertical: string;
}): Promise<ToolResult> {
  try {
    const config = VERTICAL_CONFIGS[input.vertical] || VERTICAL_CONFIGS['default'];
    
    return {
      success: true,
      data: config,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGetTonicComplianceRules(input: {
  campaign_type: string;
  platform: string;
}): Promise<ToolResult> {
  try {
    // Reglas de compliance basadas en Tonic y plataforma
    const rules = {
      general: [
        'No claims sin evidencia verificable',
        'No garantizar resultados específicos',
        'Incluir disclaimers requeridos',
        'No usar testimonios falsos',
        'No clickbait engañoso',
      ],
      rsoc: [
        'Headline debe ser relevante al contenido',
        'Teaser debe tener entre 250-1000 caracteres',
        'Content phrases deben ser informativas, no solo promocionales',
        'No mencionar competidores por nombre',
      ],
      display: [
        'Keywords deben ser relevantes (3-10 keywords)',
        'Evitar términos prohibidos de la plataforma',
      ],
      meta: [
        'No usar "Facebook" o "Instagram" en el copy',
        'No hacer promesas de ingresos específicos',
        'Primary text máximo 125 caracteres recomendado',
        'Headline máximo 40 caracteres',
        'No usar emojis excesivos',
      ],
      tiktok: [
        'No usar "TikTok" en el copy',
        'Contenido debe sentirse nativo a la plataforma',
        'Evitar tonos muy corporativos',
        'Videos deben captar atención en primeros 3 segundos',
      ],
    };
    
    const applicableRules = [
      ...rules.general,
      ...(input.campaign_type === 'rsoc' ? rules.rsoc : rules.display),
      ...(input.platform === 'META' ? rules.meta : rules.tiktok),
    ];
    
    return {
      success: true,
      data: {
        campaign_type: input.campaign_type,
        platform: input.platform,
        rules: applicableRules,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleGetCountryInsights(input: {
  country: string;
  vertical?: string;
}): Promise<ToolResult> {
  try {
    // Insights por país
    const countryInsights: Record<string, any> = {
      US: {
        language: 'English',
        currency: 'USD',
        culturalNotes: [
          'Direct communication style preferred',
          'Emphasis on savings and value',
          'Trust badges and reviews are important',
          'Mobile-first audience',
        ],
        marketingTips: [
          'Use specific numbers ($500 savings vs "save money")',
          'Social proof works well',
          'Urgency messaging is effective',
        ],
      },
      MX: {
        language: 'Spanish',
        currency: 'MXN',
        culturalNotes: [
          'Warm, friendly tone preferred',
          'Family-oriented messaging resonates',
          'Price sensitivity is high',
          'WhatsApp is preferred communication',
        ],
        marketingTips: [
          'Use "tú" for informal, friendly tone',
          'Mention monthly payments (mensualidades)',
          'Local references increase trust',
        ],
      },
      BR: {
        language: 'Portuguese',
        currency: 'BRL',
        culturalNotes: [
          'Informal, friendly communication',
          'Strong social media culture',
          'Installment payments are standard',
          'Visual content performs well',
        ],
        marketingTips: [
          'Use "você" consistently',
          'Parcelamento (installments) is key selling point',
          'Emotional appeals work well',
        ],
      },
      ES: {
        language: 'Spanish (Spain)',
        currency: 'EUR',
        culturalNotes: [
          'More formal than Latin American Spanish',
          'Quality over price messaging',
          'EU regulations apply',
        ],
        marketingTips: [
          'Use "usted" for formal contexts',
          'Mention EU compliance/security',
          'Privacy-conscious audience',
        ],
      },
    };
    
    const insights = countryInsights[input.country] || {
      language: 'English',
      currency: 'USD',
      culturalNotes: ['General international audience'],
      marketingTips: ['Use clear, simple language'],
    };
    
    return {
      success: true,
      data: {
        country: input.country,
        ...insights,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function handleSuggestCommunicationAngle(input: {
  offer_analysis: any;
  vertical_config: any;
  country?: string;
  platform: string;
}): Promise<ToolResult> {
  try {
    // Definir tipos de ángulos con sus características
    const angleTypes = {
      emotional: {
        name: 'Emotional Appeal',
        description: 'Connect with feelings, aspirations, fears',
        bestFor: ['education', 'health', 'insurance'],
        platforms: ['META', 'TIKTOK'],
        exampleHooks: [
          'Imagine finally having...',
          'What would it feel like to...',
          'Stop worrying about...',
        ],
      },
      rational: {
        name: 'Rational/Logical',
        description: 'Facts, numbers, comparisons',
        bestFor: ['auto_loans', 'insurance'],
        platforms: ['META'],
        exampleHooks: [
          'Save up to $X on...',
          'Compare X providers in Y minutes',
          '3 reasons why...',
        ],
      },
      urgency: {
        name: 'Urgency/Scarcity',
        description: 'Limited time, limited spots',
        bestFor: ['education', 'auto_loans'],
        platforms: ['META', 'TIKTOK'],
        exampleHooks: [
          'Limited time offer',
          'Only X spots left',
          'Ends this week',
        ],
      },
      social_proof: {
        name: 'Social Proof',
        description: 'Others are doing it, testimonials',
        bestFor: ['education', 'health', 'insurance'],
        platforms: ['META', 'TIKTOK'],
        exampleHooks: [
          'Join X+ people who...',
          'See why thousands chose...',
          'Rated #1 by...',
        ],
      },
      curiosity: {
        name: 'Curiosity Gap',
        description: 'Intrigue, "find out" messaging',
        bestFor: ['education', 'health'],
        platforms: ['TIKTOK', 'META'],
        exampleHooks: [
          'The secret to...',
          'What they don\'t tell you about...',
          'You won\'t believe...',
        ],
      },
    };
    
    // Seleccionar mejores ángulos para este caso
    const vertical = input.offer_analysis?.vertical || 'default';
    const platform = input.platform;
    
    const rankedAngles = Object.entries(angleTypes)
      .map(([key, angle]) => {
        let score = 50; // Base score
        
        // Bonus por vertical match
        if (angle.bestFor.includes(vertical)) {
          score += 30;
        }
        
        // Bonus por platform match
        if (angle.platforms.includes(platform)) {
          score += 20;
        }
        
        return {
          angleType: key,
          ...angle,
          score,
          reasoning: `Score: ${score}/100. ${angle.bestFor.includes(vertical) ? 'Matches vertical. ' : ''}${angle.platforms.includes(platform) ? 'Works well on ' + platform + '.' : ''}`,
        };
      })
      .sort((a, b) => b.score - a.score);
    
    return {
      success: true,
      data: {
        recommendedAngle: rankedAngles[0],
        alternativeAngles: rankedAngles.slice(1, 3),
        allAngles: rankedAngles,
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

function inferMainBenefit(offerName: string, config: VerticalConfig): string {
  const nameLower = offerName.toLowerCase();
  
  if (nameLower.includes('loan') || nameLower.includes('financing')) {
    return 'Access to financing with competitive rates';
  }
  if (nameLower.includes('scholarship') || nameLower.includes('education')) {
    return 'Opportunity for educational advancement';
  }
  if (nameLower.includes('insurance')) {
    return 'Protection and peace of mind';
  }
  if (nameLower.includes('medicare') || nameLower.includes('health')) {
    return 'Better health coverage and benefits';
  }
  
  return 'Value and convenience';
}

function inferPainPoints(vertical: string, config: VerticalConfig): string[] {
  const painPointsMap: Record<string, string[]> = {
    auto_loans: [
      'Difficulty getting approved',
      'High interest rates',
      'Long application process',
      'Poor credit history concerns',
    ],
    education: [
      'High cost of education',
      'Lack of time for traditional classes',
      'Uncertainty about career path',
      'Not knowing about available aid',
    ],
    insurance: [
      'Paying too much for coverage',
      'Confusing policy options',
      'Worry about adequate protection',
      'Time-consuming comparison shopping',
    ],
    health: [
      'Confusion about Medicare options',
      'Missing out on benefits',
      'High prescription costs',
      'Lack of coverage for needs',
    ],
  };
  
  return painPointsMap[vertical] || ['Common industry pain points'];
}

function inferUSPs(offerName: string, config: VerticalConfig): string[] {
  return [
    'Quick and easy process',
    'No hidden fees',
    'Expert support available',
    'Trusted by thousands',
  ];
}

function inferTargetDemographic(vertical: string, country?: string): string {
  const demographicsMap: Record<string, string> = {
    auto_loans: 'Adults 25-55, employed, looking to purchase or refinance a vehicle',
    education: 'Adults 18-45, interested in career advancement or degree completion',
    insurance: 'Adults 25-65, homeowners or vehicle owners seeking better coverage',
    health: 'Adults 55+, Medicare-eligible individuals seeking coverage options',
  };
  
  return demographicsMap[vertical] || 'General adult audience';
}

// ============================================
// EXPORT TOOL HANDLER MAP
// ============================================

export const researchToolHandlers = new Map<string, (input: any) => Promise<ToolResult>>([
  ['analyze_offer', handleAnalyzeOffer],
  ['get_vertical_config', handleGetVerticalConfig],
  ['get_tonic_compliance_rules', handleGetTonicComplianceRules],
  ['get_country_insights', handleGetCountryInsights],
  ['suggest_communication_angle', handleSuggestCommunicationAngle],
]);
