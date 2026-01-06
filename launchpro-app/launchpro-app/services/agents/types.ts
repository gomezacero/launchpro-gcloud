/**
 * LaunchPro Agent System - Type Definitions
 * 
 * Este archivo define todos los tipos para el sistema de agentes.
 */

import Anthropic from '@anthropic-ai/sdk';

// ============================================
// TOOL TYPES
// ============================================

export interface Tool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

// ============================================
// CAMPAIGN CONTEXT
// ============================================

export interface CampaignContext {
  // Offer info (from Tonic)
  offerId: string;
  offerName: string;
  offerDescription?: string;
  vertical: string;
  
  // Targeting
  country: string;
  language: string;
  
  // Platform
  platform: 'META' | 'TIKTOK';
  adFormat: 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  
  // Optional user inputs
  userAngle?: string;         // Si el usuario quiere un ángulo específico
  userKeywords?: string[];    // Keywords manuales
  targetAudience?: string;    // Descripción de audiencia
  
  // Tonic compliance rules
  tonicAccount: 'TONIC_META' | 'TONIC_TIKTOK';
}

// ============================================
// STRATEGY AGENT OUTPUT
// ============================================

export interface StrategyBrief {
  // Análisis de la oferta
  offerAnalysis: {
    mainBenefit: string;
    painPoints: string[];
    uniqueSellingPoints: string[];
    targetDemographic: string;
  };
  
  // Ángulo comunicacional elegido
  communicationAngle: {
    type: 'emotional' | 'rational' | 'urgency' | 'social_proof' | 'fear' | 'aspiration';
    mainMessage: string;
    tone: string;
    reasoning: string;  // Por qué eligió este ángulo
  };
  
  // Compliance
  complianceNotes: string[];
  
  // Keywords strategy
  keywordStrategy: {
    primaryKeywords: string[];
    secondaryKeywords: string[];
    negativeKeywords: string[];
  };
}

// ============================================
// COPY AGENT OUTPUT
// ============================================

export interface CopyPackage {
  // Copy Master (mensaje central)
  copyMaster: string;
  
  // Keywords para Tonic (3-10)
  keywords: string[];
  
  // Artículo RSOC
  article: {
    headline: string;
    teaser: string;
    contentGenerationPhrases: string[];
  };
  
  // Ad Copies (puede haber variantes)
  adCopies: AdCopy[];
  
  // Compliance check
  complianceScore: number;  // 0-100
  complianceIssues: string[];
}

export interface AdCopy {
  variant: string;  // A, B, C...
  primaryText: string;
  headline: string;
  description: string;
  callToAction: string;
}

// ============================================
// CREATIVE AGENT OUTPUT
// ============================================

export interface CreativePackage {
  // Image prompts and results
  images: GeneratedImage[];
  
  // Video prompts and results
  videos: GeneratedVideo[];
  
  // Creative strategy notes
  visualStrategy: string;
}

export interface GeneratedImage {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  imageUrl?: string;
  gcsPath?: string;
  status: 'pending' | 'generated' | 'failed';
}

export interface GeneratedVideo {
  prompt: string;
  durationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  videoUrl?: string;
  gcsPath?: string;
  status: 'pending' | 'generated' | 'failed';
}

// ============================================
// AGENT STATE
// ============================================

export interface AgentState {
  status: 'idle' | 'thinking' | 'using_tool' | 'completed' | 'failed';
  currentStep: string;
  steps: AgentStep[];
  iterations: number;
  maxIterations: number;
}

export interface AgentStep {
  type: 'thought' | 'tool_use' | 'tool_result' | 'output';
  content: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: ToolResult;
  timestamp: Date;
}

// ============================================
// AGENT MESSAGES
// ============================================

export type AgentMessage = Anthropic.MessageParam;

export interface AgentConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  maxIterations: number;
  systemPrompt: string;
  tools: Tool[];
}

// ============================================
// VERTICAL-SPECIFIC CONFIGS
// ============================================

export interface VerticalConfig {
  name: string;
  keywords: string[];
  angles: string[];
  toneGuidelines: string;
  complianceRules: string[];
  visualStyle: string;
  exampleCopies: string[];
}

// Configuraciones por vertical (se expandirán con el tiempo)
export const VERTICAL_CONFIGS: Record<string, VerticalConfig> = {
  'auto_loans': {
    name: 'Auto Loans / Car Financing',
    keywords: ['financing', 'low rates', 'approval', 'credit', 'monthly payments'],
    angles: ['financial freedom', 'easy approval', 'dream car', 'no credit check'],
    toneGuidelines: 'Professional but accessible. Focus on possibility and ease.',
    complianceRules: [
      'Do not guarantee approval',
      'Include "subject to credit approval" when mentioning rates',
      'Do not use misleading APR claims',
    ],
    visualStyle: 'Show cars, happy families, keys, open roads. Avoid luxury excess.',
    exampleCopies: [
      'Your next car is closer than you think. Pre-qualify in 60 seconds.',
      'Bad credit? No problem. See your real rates now.',
    ],
  },
  'education': {
    name: 'Education / Scholarships / Online Degrees',
    keywords: ['scholarship', 'degree', 'online', 'accredited', 'financial aid'],
    angles: ['career advancement', 'flexible learning', 'free money', 'better future'],
    toneGuidelines: 'Inspirational and supportive. Focus on transformation and opportunity.',
    complianceRules: [
      'Do not guarantee job placement',
      'Specify "scholarships may vary" when discussing amounts',
      'Use "accredited" only for verified institutions',
    ],
    visualStyle: 'Graduation caps, laptops, diverse students, campus imagery.',
    exampleCopies: [
      'Scholarships up to $5,000 available. Check your eligibility now.',
      'Earn your degree online. Start classes anytime.',
    ],
  },
  'insurance': {
    name: 'Insurance (Auto, Home, Life)',
    keywords: ['save', 'quote', 'coverage', 'protection', 'rates'],
    angles: ['savings', 'peace of mind', 'family protection', 'comparison'],
    toneGuidelines: 'Trustworthy and reassuring. Focus on protection and savings.',
    complianceRules: [
      'Do not guarantee specific savings amounts',
      'Include "rates vary by state" disclaimers',
      'Do not make false claims about competitors',
    ],
    visualStyle: 'Families, homes, cars, protection imagery. Warm colors.',
    exampleCopies: [
      'Could you save $500+ on car insurance? Get your free quote.',
      'Compare rates from top insurers in 2 minutes.',
    ],
  },
  'health': {
    name: 'Health / Medicare / Supplements',
    keywords: ['benefits', 'coverage', 'Medicare', 'prescription', 'health'],
    angles: ['better coverage', 'savings', 'eligibility', 'enrollment'],
    toneGuidelines: 'Caring and informative. Focus on benefits and help.',
    complianceRules: [
      'Do not make medical claims without evidence',
      'Include Medicare disclaimers where required',
      'Do not use fear tactics about health',
    ],
    visualStyle: 'Seniors, families, healthcare imagery. Calming blues and greens.',
    exampleCopies: [
      'New Medicare benefits you may not know about. Check your eligibility.',
      'Are you getting all the coverage you deserve?',
    ],
  },
  'default': {
    name: 'General / Other',
    keywords: [],
    angles: ['value', 'convenience', 'quality', 'trust'],
    toneGuidelines: 'Professional and engaging. Focus on clear value proposition.',
    complianceRules: [
      'Do not make unverifiable claims',
      'Be truthful about product/service',
    ],
    visualStyle: 'Clean, professional imagery aligned with the offer.',
    exampleCopies: [],
  },
};
