import { Storage } from '@google-cloud/storage';

/**
 * Get Google Cloud Storage client with proper credentials
 *
 * For Vercel deployment: Uses GCP_SERVICE_ACCOUNT_KEY environment variable (JSON string)
 * For local development: Falls back to GOOGLE_APPLICATION_CREDENTIALS file path
 */
export function getStorageClient(): Storage {
  const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;

  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson);
      return new Storage({
        projectId: process.env.GCP_PROJECT_ID || credentials.project_id,
        credentials,
      });
    } catch (e) {
      console.warn('[GCS] Failed to parse GCP_SERVICE_ACCOUNT_KEY, falling back to default auth');
    }
  }

  // Fallback to default credentials (for local development with GOOGLE_APPLICATION_CREDENTIALS file)
  return new Storage({
    projectId: process.env.GCP_PROJECT_ID,
  });
}

// Singleton instance
let storageInstance: Storage | null = null;

export function getStorage(): Storage {
  if (!storageInstance) {
    storageInstance = getStorageClient();
  }
  return storageInstance;
}

export function getStorageBucket() {
  const bucketName = process.env.GCP_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('GCP_STORAGE_BUCKET environment variable is not set');
  }
  return getStorage().bucket(bucketName);
}
