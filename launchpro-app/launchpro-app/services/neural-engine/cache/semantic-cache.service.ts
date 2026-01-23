/**
 * RSOC Creative Neural Engine - Semantic Cache Service
 *
 * Uses Firestore for caching with TTL support.
 * Implements semantic similarity matching for cache hits.
 *
 * Decision: Using Firestore instead of Redis to minimize infrastructure costs.
 */

import { Firestore, Timestamp, FieldValue } from '@google-cloud/firestore';
import { getEmbeddingsService, EmbeddingsService } from '../rag/embeddings.service';
import { CacheEntry, CacheStats } from '../types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const COLLECTIONS = {
  RESEARCH: 'neural_cache_research',
  ANGLES: 'neural_cache_angles',
  PROMPTS: 'neural_cache_prompts',
  EMBEDDINGS: 'neural_cache_embeddings',
} as const;

// TTL in seconds
const TTL = {
  RESEARCH: 86400, // 24 hours
  ANGLES: 43200, // 12 hours
  PROMPTS: 604800, // 7 days
  EMBEDDINGS: 604800, // 7 days
} as const;

// Similarity threshold for semantic cache hits
const SIMILARITY_THRESHOLD = 0.92;

// ============================================================================
// SEMANTIC CACHE SERVICE
// ============================================================================

export class SemanticCacheService {
  private firestore: Firestore;
  private embeddingsService: EmbeddingsService;
  private stats: CacheStats;

  constructor() {
    // Parse credentials from environment (for Vercel serverless)
    const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
    let credentials: any = null;

    if (credentialsJson) {
      try {
        credentials = JSON.parse(credentialsJson);
        console.log(`[SemanticCacheService] Using explicit GCP credentials for project: ${credentials.project_id}`);
      } catch (e: any) {
        console.warn(`[SemanticCacheService] Failed to parse GCP_SERVICE_ACCOUNT_KEY:`, e.message);
      }
    }

    // Initialize Firestore with explicit credentials if available
    const firestoreOptions: any = {
      projectId: process.env.GCP_PROJECT_ID,
    };

    if (credentials) {
      firestoreOptions.credentials = credentials;
    }

    this.firestore = new Firestore(firestoreOptions);

    this.embeddingsService = getEmbeddingsService();

    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgLatencyMs: 0,
    };
  }

  // ==========================================================================
  // CORE CACHE METHODS
  // ==========================================================================

  /**
   * Get or compute a cached value
   * Supports both exact key matching and semantic similarity matching
   */
  async getOrCompute<T>(
    collection: keyof typeof COLLECTIONS,
    key: string,
    query: string,
    computeFn: () => Promise<T>,
    options: {
      useSemantic?: boolean;
      ttlSeconds?: number;
    } = {}
  ): Promise<{ result: T; fromCache: boolean; similarity?: number }> {
    const startTime = Date.now();
    const collectionName = COLLECTIONS[collection];
    const ttl = options.ttlSeconds || TTL[collection];

    try {
      // 1. Try exact key match first
      const exactMatch = await this.getByKey<T>(collectionName, key);
      if (exactMatch) {
        this.recordHit(startTime);
        return { result: exactMatch.data, fromCache: true };
      }

      // 2. Try semantic similarity match (if enabled)
      if (options.useSemantic !== false) {
        const semanticMatch = await this.findSemanticMatch<T>(collectionName, query);
        if (semanticMatch && semanticMatch.similarity >= SIMILARITY_THRESHOLD) {
          this.recordHit(startTime);
          return {
            result: semanticMatch.data,
            fromCache: true,
            similarity: semanticMatch.similarity,
          };
        }
      }

      // 3. Cache miss - compute value
      this.recordMiss(startTime);
      const result = await computeFn();

      // 4. Store in cache
      await this.set(collectionName, key, query, result, ttl);

      return { result, fromCache: false };
    } catch (error: any) {
      console.error(`[SemanticCache] Error in getOrCompute:`, error.message);
      // On cache error, just compute the value
      const result = await computeFn();
      return { result, fromCache: false };
    }
  }

  /**
   * Get a value by exact key
   */
  async getByKey<T>(collection: string, key: string): Promise<CacheEntry<T> | null> {
    try {
      const docRef = this.firestore.collection(collection).doc(this.sanitizeKey(key));
      const doc = await docRef.get();

      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as any;

      // Check if expired
      if (data.expireAt && data.expireAt.toDate() < new Date()) {
        // Expired - delete and return null
        await docRef.delete();
        return null;
      }

      // Update hit count
      await docRef.update({
        hitCount: FieldValue.increment(1),
      });

      return {
        key,
        data: data.data,
        embedding: data.embedding,
        createdAt: data.createdAt.toDate(),
        expireAt: data.expireAt.toDate(),
        hitCount: (data.hitCount || 0) + 1,
      };
    } catch (error: any) {
      console.error(`[SemanticCache] Error in getByKey:`, error.message);
      return null;
    }
  }

  /**
   * Find semantically similar cache entry
   */
  async findSemanticMatch<T>(
    collection: string,
    query: string
  ): Promise<{ data: T; similarity: number } | null> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingsService.embed(query);

      // Get all non-expired entries in collection (limit to recent 100)
      const snapshot = await this.firestore
        .collection(collection)
        .where('expireAt', '>', Timestamp.now())
        .orderBy('expireAt', 'desc')
        .limit(100)
        .get();

      if (snapshot.empty) {
        return null;
      }

      // Find best match by similarity
      let bestMatch: { data: T; similarity: number } | null = null;

      for (const doc of snapshot.docs) {
        const entry = doc.data();
        if (!entry.embedding || entry.embedding.length === 0) {
          continue;
        }

        const similarity = this.embeddingsService.cosineSimilarity(
          queryEmbedding,
          entry.embedding
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { data: entry.data, similarity };
          }
        }
      }

      return bestMatch;
    } catch (error: any) {
      console.error(`[SemanticCache] Error in findSemanticMatch:`, error.message);
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    collection: string,
    key: string,
    query: string,
    data: T,
    ttlSeconds: number
  ): Promise<void> {
    try {
      // Generate embedding for semantic matching
      const embedding = await this.embeddingsService.embed(query);

      const now = new Date();
      const expireAt = new Date(now.getTime() + ttlSeconds * 1000);

      await this.firestore
        .collection(collection)
        .doc(this.sanitizeKey(key))
        .set({
          key,
          query,
          data,
          embedding,
          createdAt: Timestamp.fromDate(now),
          expireAt: Timestamp.fromDate(expireAt),
          hitCount: 0,
        });
    } catch (error: any) {
      console.error(`[SemanticCache] Error in set:`, error.message);
    }
  }

  /**
   * Delete a specific cache entry
   */
  async delete(collection: keyof typeof COLLECTIONS, key: string): Promise<void> {
    try {
      await this.firestore
        .collection(COLLECTIONS[collection])
        .doc(this.sanitizeKey(key))
        .delete();
    } catch (error: any) {
      console.error(`[SemanticCache] Error in delete:`, error.message);
    }
  }

  /**
   * Clear all expired entries in a collection
   */
  async clearExpired(collection: keyof typeof COLLECTIONS): Promise<number> {
    try {
      const collectionName = COLLECTIONS[collection];
      const snapshot = await this.firestore
        .collection(collectionName)
        .where('expireAt', '<', Timestamp.now())
        .get();

      const batch = this.firestore.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      return snapshot.size;
    } catch (error: any) {
      console.error(`[SemanticCache] Error in clearExpired:`, error.message);
      return 0;
    }
  }

  // ==========================================================================
  // CONVENIENCE METHODS
  // ==========================================================================

  /**
   * Cache research results (24h TTL)
   */
  async cacheResearch<T>(
    country: string,
    vertical: string,
    query: string,
    computeFn: () => Promise<T>
  ): Promise<{ result: T; fromCache: boolean }> {
    const key = `${country}_${vertical}_${this.getDateKey()}`;
    return this.getOrCompute('RESEARCH', key, query, computeFn, {
      useSemantic: true,
      ttlSeconds: TTL.RESEARCH,
    });
  }

  /**
   * Cache angle strategies (12h TTL)
   */
  async cacheAngle<T>(
    offerId: string,
    country: string,
    query: string,
    computeFn: () => Promise<T>
  ): Promise<{ result: T; fromCache: boolean }> {
    const key = `${offerId}_${country}`;
    return this.getOrCompute('ANGLES', key, query, computeFn, {
      useSemantic: true,
      ttlSeconds: TTL.ANGLES,
    });
  }

  /**
   * Cache visual prompts (7d TTL)
   */
  async cachePrompt<T>(
    conceptHash: string,
    query: string,
    computeFn: () => Promise<T>
  ): Promise<{ result: T; fromCache: boolean }> {
    return this.getOrCompute('PROMPTS', conceptHash, query, computeFn, {
      useSemantic: true,
      ttlSeconds: TTL.PROMPTS,
    });
  }

  // ==========================================================================
  // SIMPLE GET/SET METHODS (for agent use)
  // ==========================================================================

  /**
   * Get research data by key
   */
  async getResearch<T>(key: string): Promise<T | null> {
    const entry = await this.getByKey<T>(COLLECTIONS.RESEARCH, key);
    return entry ? entry.data : null;
  }

  /**
   * Set research data
   */
  async setResearch<T>(key: string, data: T): Promise<void> {
    await this.set(COLLECTIONS.RESEARCH, key, key, data, TTL.RESEARCH);
  }

  /**
   * Get angle strategy by key
   */
  async getAngles<T>(key: string): Promise<T | null> {
    const entry = await this.getByKey<T>(COLLECTIONS.ANGLES, key);
    return entry ? entry.data : null;
  }

  /**
   * Set angle strategy
   */
  async setAngles<T>(key: string, data: T): Promise<void> {
    await this.set(COLLECTIONS.ANGLES, key, key, data, TTL.ANGLES);
  }

  /**
   * Get visual prompts by key
   */
  async getPrompts<T>(key: string): Promise<T | null> {
    const entry = await this.getByKey<T>(COLLECTIONS.PROMPTS, key);
    return entry ? entry.data : null;
  }

  /**
   * Set visual prompts
   */
  async setPrompts<T>(key: string, data: T): Promise<void> {
    await this.set(COLLECTIONS.PROMPTS, key, key, data, TTL.PROMPTS);
  }

  // ==========================================================================
  // STATS & UTILITIES
  // ==========================================================================

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgLatencyMs: 0,
    };
  }

  private recordHit(startTime: number): void {
    this.stats.hits++;
    this.updateLatency(startTime);
  }

  private recordMiss(startTime: number): void {
    this.stats.misses++;
    this.updateLatency(startTime);
  }

  private updateLatency(startTime: number): void {
    const latency = Date.now() - startTime;
    const total = this.stats.hits + this.stats.misses;
    this.stats.avgLatencyMs =
      (this.stats.avgLatencyMs * (total - 1) + latency) / total;
  }

  private sanitizeKey(key: string): string {
    // Firestore document IDs can't contain /
    return key.replace(/\//g, '_').slice(0, 1500);
  }

  private getDateKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let cacheServiceInstance: SemanticCacheService | null = null;

export function getSemanticCacheService(): SemanticCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new SemanticCacheService();
  }
  return cacheServiceInstance;
}

// ============================================================================
// CACHE KEY GENERATORS
// ============================================================================

export const CacheKeys = {
  research: (country: string, vertical: string, date?: string): string => {
    const dateKey = date || new Date().toISOString().split('T')[0];
    return `research_${country}_${vertical}_${dateKey}`;
  },

  angle: (offerId: string, country: string, platform: string): string => {
    return `angle_${offerId}_${country}_${platform}`;
  },

  prompt: (visualConcept: string): string => {
    // Create hash from concept
    const hash = visualConcept
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 50);
    return `prompt_${hash}`;
  },

  embedding: (offerId: string): string => {
    return `embedding_${offerId}`;
  },
};
