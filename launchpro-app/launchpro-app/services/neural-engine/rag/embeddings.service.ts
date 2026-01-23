/**
 * RSOC Creative Neural Engine - Embeddings Service
 *
 * Provides text embedding capabilities using Google's text-embedding-004 model.
 * Used by the Asset Manager agent for RAG (Retrieval-Augmented Generation).
 */

import { v1, helpers } from '@google-cloud/aiplatform';
import { EmbeddingDocument, SimilarityResult } from '../types';

const { PredictionServiceClient } = v1;

// ============================================================================
// CONFIGURATION
// ============================================================================

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 768;
const MAX_BATCH_SIZE = 100;
const DEFAULT_TOP_K = 10;

// ============================================================================
// EMBEDDINGS SERVICE
// ============================================================================

export class EmbeddingsService {
  private client: any = null;
  private projectId: string;
  private location: string;
  private endpoint: string;
  private credentials: any = null;

  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID || '';
    this.location = process.env.GCP_LOCATION || 'us-central1';
    this.endpoint = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${EMBEDDING_MODEL}`;

    // Parse credentials from environment (for Vercel serverless)
    const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;
    if (credentialsJson) {
      try {
        this.credentials = JSON.parse(credentialsJson);
        console.log(`[EmbeddingsService] Using explicit GCP credentials for project: ${this.credentials.project_id}`);
      } catch (e: any) {
        console.warn(`[EmbeddingsService] Failed to parse GCP_SERVICE_ACCOUNT_KEY:`, e.message);
      }
    }

    if (!this.projectId) {
      console.warn('[EmbeddingsService] GCP_PROJECT_ID not set. Embeddings will fail.');
    }
  }

  /**
   * Get or create the prediction client
   */
  private getClient(): any {
    if (!this.client) {
      const clientOptions: any = {
        apiEndpoint: `${this.location}-aiplatform.googleapis.com`,
      };

      // Use explicit credentials if available (for Vercel deployment)
      if (this.credentials) {
        clientOptions.credentials = this.credentials;
        clientOptions.projectId = this.credentials.project_id || this.projectId;
      }

      this.client = new PredictionServiceClient(clientOptions);
    }
    return this.client;
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    try {
      const client = this.getClient();

      // Prepare the instance for the embedding request
      const instance = helpers.toValue({
        content: text,
        task_type: 'RETRIEVAL_DOCUMENT',
      });

      const instances = [instance];

      // Make the prediction request
      const [response] = await client.predict({
        endpoint: this.endpoint,
        instances,
      });

      // Extract embedding from response
      const predictions = response.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error('No predictions returned from embedding model');
      }

      const prediction = predictions[0];
      const embeddingValue = (prediction as any).structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;

      if (!embeddingValue) {
        throw new Error('Invalid embedding response structure');
      }

      const embedding = embeddingValue.map((v: any) => v.numberValue as number);

      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.warn(`[EmbeddingsService] Unexpected embedding dimensions: ${embedding.length} (expected ${EMBEDDING_DIMENSIONS})`);
      }

      return embedding;
    } catch (error: any) {
      console.error('[EmbeddingsService] Error generating embedding:', error.message);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    if (texts.length > MAX_BATCH_SIZE) {
      // Process in chunks
      const results: number[][] = [];
      for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
        const chunk = texts.slice(i, i + MAX_BATCH_SIZE);
        const chunkResults = await this.embedBatchInternal(chunk);
        results.push(...chunkResults);
      }
      return results;
    }

    return this.embedBatchInternal(texts);
  }

  private async embedBatchInternal(texts: string[]): Promise<number[][]> {
    try {
      const client = this.getClient();

      // Prepare instances for batch embedding
      const instances = texts.map((text) =>
        helpers.toValue({
          content: text,
          task_type: 'RETRIEVAL_DOCUMENT',
        })
      );

      // Make the prediction request
      const [response] = await client.predict({
        endpoint: this.endpoint,
        instances,
      });

      // Extract embeddings from response
      const predictions = response.predictions;
      if (!predictions || predictions.length !== texts.length) {
        throw new Error(`Expected ${texts.length} predictions, got ${predictions?.length || 0}`);
      }

      const embeddings: number[][] = predictions.map((prediction: any) => {
        const embeddingValue = prediction.structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;

        if (!embeddingValue) {
          throw new Error('Invalid embedding response structure in batch');
        }

        return embeddingValue.map((v: any) => v.numberValue as number);
      });

      return embeddings;
    } catch (error: any) {
      console.error('[EmbeddingsService] Error in batch embedding, falling back to sequential:', error.message);
      // Fallback to sequential processing
      const embeddings: number[][] = [];
      for (const text of texts) {
        const embedding = await this.embed(text);
        embeddings.push(embedding);
      }
      return embeddings;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Find most similar documents to a query
   */
  async findSimilar(
    query: string,
    documents: EmbeddingDocument[],
    topK: number = DEFAULT_TOP_K
  ): Promise<SimilarityResult[]> {
    if (documents.length === 0) {
      return [];
    }

    // Generate query embedding with RETRIEVAL_QUERY task type
    const queryEmbedding = await this.embedForQuery(query);

    // Calculate similarities
    const results: SimilarityResult[] = documents.map((doc) => ({
      document: doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    // Sort by similarity (descending) and take top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * Generate embedding for a query (uses RETRIEVAL_QUERY task type)
   */
  async embedForQuery(text: string): Promise<number[]> {
    try {
      const client = this.getClient();

      const instance = helpers.toValue({
        content: text,
        task_type: 'RETRIEVAL_QUERY',
      });

      const [response] = await client.predict({
        endpoint: this.endpoint,
        instances: [instance],
      });

      const predictions = response.predictions;
      if (!predictions || predictions.length === 0) {
        throw new Error('No predictions returned from embedding model');
      }

      const prediction = predictions[0];
      const embeddingValue = (prediction as any).structValue?.fields?.embeddings?.structValue?.fields?.values?.listValue?.values;

      if (!embeddingValue) {
        throw new Error('Invalid embedding response structure');
      }

      return embeddingValue.map((v: any) => v.numberValue as number);
    } catch (error: any) {
      console.error('[EmbeddingsService] Error generating query embedding:', error.message);
      throw error;
    }
  }

  /**
   * Find similar documents from pre-computed embeddings
   */
  findSimilarFromEmbedding(
    queryEmbedding: number[],
    documents: EmbeddingDocument[],
    topK: number = DEFAULT_TOP_K
  ): SimilarityResult[] {
    if (documents.length === 0) {
      return [];
    }

    const results: SimilarityResult[] = documents.map((doc) => ({
      document: doc,
      similarity: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * Create a document with embedding
   */
  async createDocument(
    id: string,
    content: string,
    metadata: Record<string, any> = {}
  ): Promise<EmbeddingDocument> {
    const embedding = await this.embed(content);

    return {
      id,
      content,
      embedding,
      metadata,
      createdAt: new Date(),
    };
  }

  /**
   * Get embedding dimensions
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let embeddingsServiceInstance: EmbeddingsService | null = null;

export function getEmbeddingsService(): EmbeddingsService {
  if (!embeddingsServiceInstance) {
    embeddingsServiceInstance = new EmbeddingsService();
  }
  return embeddingsServiceInstance;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Prepare text for embedding (normalize, clean)
 */
export function prepareTextForEmbedding(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s.,!?-]/g, '') // Remove special characters
    .slice(0, 8000); // Max length for embedding model
}

/**
 * Combine multiple texts into a single embedding input
 */
export function combineTextsForEmbedding(texts: Record<string, string>): string {
  return Object.entries(texts)
    .map(([key, value]) => `${key}: ${value}`)
    .join(' | ');
}
