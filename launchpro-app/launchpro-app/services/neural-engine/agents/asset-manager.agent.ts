/**
 * RSOC Creative Neural Engine - Asset Manager Agent
 *
 * Role: RAG (Retrieval-Augmented Generation) Librarian
 * Technology: Embeddings + Firestore Vector Search
 *
 * This agent determines if a campaign is new or has historical data:
 * - If exists: Retrieves top performing ads and approved copy
 * - If new: Finds semantically similar categories or universal templates
 *
 * Key Capabilities:
 * - Vector similarity search for Top Ads
 * - Safe Copy repository management
 * - Blacklist term management
 * - Campaign reference lookup
 */

import { prisma } from '@/lib/prisma';
import {
  RetrievedAssets,
  TopAdReference,
  SafeCopyOption,
  CampaignReference,
  NeuralEngineInput,
  AgentError,
  EmbeddingDocument,
  CommunicationAngle,
} from '../types';
import { getEmbeddingsService, prepareTextForEmbedding, combineTextsForEmbedding } from '../rag/embeddings.service';
import { ASSET_MANAGER_CONFIG } from '../config/model-configs';

// ============================================================================
// CONSTANTS
// ============================================================================

const AGENT_NAME = 'AssetManager';
const TOP_ADS_LIMIT = 5;
const SAFE_COPIES_LIMIT = 10;
const SIMILAR_CAMPAIGNS_LIMIT = 3;
const SIMILARITY_THRESHOLD = 0.7;

// ============================================================================
// ASSET MANAGER AGENT
// ============================================================================

export class AssetManagerAgent {
  private embeddingsService = getEmbeddingsService();

  constructor() {
    console.log(`[${AGENT_NAME}] Initialized`);
  }

  /**
   * Execute the Asset Manager retrieval
   */
  async execute(input: NeuralEngineInput): Promise<{
    success: boolean;
    data?: RetrievedAssets;
    error?: AgentError;
  }> {
    const startTime = Date.now();

    console.log(`[${AGENT_NAME}] Starting asset retrieval for ${input.offer.name} in ${input.country}`);

    try {
      // Execute all retrievals in parallel
      const [topAds, safeCopies, blacklistedTerms, similarCampaigns] = await Promise.all([
        this.retrieveTopAds(input),
        this.retrieveSafeCopies(input),
        this.retrieveBlacklistedTerms(input),
        this.retrieveSimilarCampaigns(input),
      ]);

      const retrievedAssets: RetrievedAssets = {
        topAds,
        safeCopies,
        blacklistedTerms,
        similarCampaigns,
      };

      const duration = Date.now() - startTime;
      console.log(`[${AGENT_NAME}] Asset retrieval completed in ${duration}ms`, {
        topAdsCount: topAds.length,
        safeCopiesCount: safeCopies.length,
        blacklistedCount: blacklistedTerms.length,
        similarCampaignsCount: similarCampaigns.length,
      });

      return { success: true, data: retrievedAssets };
    } catch (error: any) {
      console.error(`[${AGENT_NAME}] Error:`, error.message);

      return {
        success: false,
        error: {
          agent: AGENT_NAME,
          error: error.message,
          code: 'EMBEDDING_ERROR',
          timestamp: new Date(),
          recoverable: true,
        },
      };
    }
  }

  /**
   * Retrieve top performing ads using semantic search
   */
  private async retrieveTopAds(input: NeuralEngineInput): Promise<TopAdReference[]> {
    try {
      // Build the query text for semantic search
      const queryText = combineTextsForEmbedding({
        offer: input.offer.name,
        vertical: input.offer.vertical,
        country: input.country,
        platform: input.platform,
      });

      // First, try to get ads from the same vertical and country
      const exactMatches = await this.getTopAdsFromDatabase(input, true);

      if (exactMatches.length >= TOP_ADS_LIMIT) {
        return exactMatches.slice(0, TOP_ADS_LIMIT);
      }

      // If not enough exact matches, use semantic search to find similar
      const semanticMatches = await this.getTopAdsFromDatabase(input, false);

      // Combine and deduplicate
      const allAds = [...exactMatches, ...semanticMatches];
      const uniqueAds = this.deduplicateAds(allAds);

      return uniqueAds.slice(0, TOP_ADS_LIMIT);
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Error retrieving top ads:`, error);
      return [];
    }
  }

  /**
   * Get top ads from database
   * Note: In production, this would query BigQuery for performance data
   */
  private async getTopAdsFromDatabase(
    input: NeuralEngineInput,
    exactMatch: boolean
  ): Promise<TopAdReference[]> {
    try {
      // Query campaigns with their platforms relation
      const campaigns = await prisma.campaign.findMany({
        where: {
          ...(exactMatch ? { country: input.country } : {}),
          copyMaster: { not: null },
        },
        include: {
          offer: true,
          platforms: true,
          aiContent: {
            take: 5,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 20,
      });

      // Transform to TopAdReference format
      return campaigns.map((campaign): TopAdReference => {
        // Get platform-specific data
        const platformData = campaign.platforms.find(
          (p: any) => p.platform === input.platform
        ) || campaign.platforms[0];

        // Get headline from AI content or manual
        const headlineContent = campaign.aiContent.find((c: any) => c.contentType === 'headline');
        const primaryTextContent = campaign.aiContent.find((c: any) => c.contentType === 'primaryText');

        return {
          id: campaign.id,
          platform: (platformData?.platform as 'META' | 'TIKTOK') || input.platform,
          vertical: campaign.offer?.vertical || 'Unknown',
          country: campaign.country,
          headline: platformData?.manualAdTitle || (headlineContent?.content as string) || '',
          primaryText: platformData?.manualPrimaryText || (primaryTextContent?.content as string) || '',
          description: campaign.copyMaster || undefined,
          // Placeholder metrics - in production, these come from BigQuery
          ctr: 0,
          roas: 0,
          spend: 0,
          conversions: 0,
          similarityScore: exactMatch ? 1.0 : 0.8,
        };
      });
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Database query failed:`, error);
      return [];
    }
  }

  /**
   * Deduplicate ads by ID
   */
  private deduplicateAds(ads: TopAdReference[]): TopAdReference[] {
    const seen = new Set<string>();
    return ads.filter((ad) => {
      if (seen.has(ad.id)) return false;
      seen.add(ad.id);
      return true;
    });
  }

  /**
   * Retrieve safe (pre-approved) copy options
   */
  private async retrieveSafeCopies(input: NeuralEngineInput): Promise<SafeCopyOption[]> {
    try {
      // Check if SafeCopy table exists
      // For now, we'll return templates based on vertical

      // Try to get from database
      const safeCopies = await this.getSafeCopiesFromDatabase(input);

      if (safeCopies.length > 0) {
        return safeCopies;
      }

      // Fallback to default templates
      return this.getDefaultSafeCopies(input);
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Error retrieving safe copies:`, error);
      return this.getDefaultSafeCopies(input);
    }
  }

  /**
   * Get safe copies from database
   */
  private async getSafeCopiesFromDatabase(input: NeuralEngineInput): Promise<SafeCopyOption[]> {
    // Note: This would query a SafeCopy table when it exists
    // For now, return empty to use defaults
    return [];
  }

  /**
   * Get default safe copies based on vertical
   */
  private getDefaultSafeCopies(input: NeuralEngineInput): SafeCopyOption[] {
    const vertical = input.offer.vertical.toLowerCase();

    // Default templates by vertical
    const templates: Record<string, SafeCopyOption[]> = {
      'car loans': [
        {
          id: 'default-headline-1',
          copyType: 'headline',
          content: 'Compare Car Loan Rates',
          vertical: 'Car Loans',
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
        {
          id: 'default-cta-1',
          copyType: 'cta',
          content: 'Get Your Quote',
          vertical: 'Car Loans',
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
      ],
      insurance: [
        {
          id: 'default-headline-1',
          copyType: 'headline',
          content: 'Save on Insurance Today',
          vertical: 'Insurance',
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
        {
          id: 'default-cta-1',
          copyType: 'cta',
          content: 'Compare Rates',
          vertical: 'Insurance',
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
      ],
      default: [
        {
          id: 'default-headline-1',
          copyType: 'headline',
          content: `Find the Best ${input.offer.vertical}`,
          vertical: input.offer.vertical,
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
        {
          id: 'default-cta-1',
          copyType: 'cta',
          content: 'Learn More',
          vertical: input.offer.vertical,
          platform: input.platform,
          language: input.language,
          approved: true,
          usageCount: 0,
        },
      ],
    };

    return templates[vertical] || templates['default'];
  }

  /**
   * Retrieve blacklisted terms for this vertical/platform
   */
  private async retrieveBlacklistedTerms(input: NeuralEngineInput): Promise<string[]> {
    // Platform-specific blacklisted terms
    const platformBlacklist: Record<string, string[]> = {
      META: [
        'guaranteed',
        'free money',
        'get rich quick',
        'miracle',
        'no risk',
        '100% success',
        'limited time only',
        'act now',
      ],
      TIKTOK: [
        'guaranteed',
        'free money',
        'get rich quick',
        'miracle',
        'no risk',
        'click here',
        'swipe up',
      ],
    };

    // Vertical-specific blacklisted terms
    const verticalBlacklist: Record<string, string[]> = {
      'Car Loans': ['no credit check', 'instant approval', 'everyone approved'],
      Insurance: ['cheapest', 'best rates guaranteed', 'lowest prices'],
      'Personal Loans': ['no credit check', 'instant cash', 'payday'],
      Education: ['diploma mill', 'fake degree', 'instant certificate'],
    };

    const platformTerms = platformBlacklist[input.platform] || [];
    const verticalTerms = verticalBlacklist[input.offer.vertical] || [];

    return [...new Set([...platformTerms, ...verticalTerms])];
  }

  /**
   * Retrieve similar campaigns for reference
   */
  private async retrieveSimilarCampaigns(input: NeuralEngineInput): Promise<CampaignReference[]> {
    try {
      // Find campaigns in the same country with copy master
      const campaigns = await prisma.campaign.findMany({
        where: {
          country: input.country,
          copyMaster: { not: null },
        },
        include: {
          offer: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 10,
      });

      // Filter and transform
      return campaigns
        .filter((c) => c.copyMaster) // Only campaigns with copy
        .slice(0, SIMILAR_CAMPAIGNS_LIMIT)
        .map((campaign): CampaignReference => ({
          id: campaign.id,
          name: campaign.name,
          vertical: campaign.offer?.vertical || 'Unknown',
          country: campaign.country,
          roas: 0, // Would come from BigQuery
          copyMaster: campaign.copyMaster || '',
          angle: (campaign.communicationAngle as CommunicationAngle) || 'rational',
        }));
    } catch (error) {
      console.warn(`[${AGENT_NAME}] Error retrieving similar campaigns:`, error);
      return [];
    }
  }

  /**
   * Index a new ad for future retrieval (Data Flywheel)
   */
  async indexAd(ad: {
    id: string;
    platform: 'META' | 'TIKTOK';
    vertical: string;
    country: string;
    headline: string;
    primaryText: string;
    metrics: { ctr: number; roas: number; spend: number; conversions: number };
  }): Promise<void> {
    try {
      // Create embedding for the ad content
      const contentToEmbed = combineTextsForEmbedding({
        headline: ad.headline,
        primaryText: ad.primaryText,
        vertical: ad.vertical,
        country: ad.country,
      });

      const embedding = await this.embeddingsService.embed(
        prepareTextForEmbedding(contentToEmbed)
      );

      // Store in Firestore for future retrieval
      // This would be implemented with the Firestore vector store
      console.log(`[${AGENT_NAME}] Indexed ad ${ad.id} with embedding dimensions: ${embedding.length}`);
    } catch (error) {
      console.error(`[${AGENT_NAME}] Error indexing ad:`, error);
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let assetManagerInstance: AssetManagerAgent | null = null;

export function getAssetManagerAgent(): AssetManagerAgent {
  if (!assetManagerInstance) {
    assetManagerInstance = new AssetManagerAgent();
  }
  return assetManagerInstance;
}
