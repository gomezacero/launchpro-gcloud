import { Storage } from '@google-cloud/storage';

/**
 * Get Google Cloud Storage client with proper credentials
 *
 * For Vercel deployment: Uses GCP_SERVICE_ACCOUNT_KEY environment variable (JSON string)
 * For local development: Falls back to GOOGLE_APPLICATION_CREDENTIALS file path
 */
export function getStorageClient(): Storage {
  const credentialsJson = process.env.GCP_SERVICE_ACCOUNT_KEY;

  console.log('[GCS] Initializing Storage client...');
  console.log('[GCS] GCP_SERVICE_ACCOUNT_KEY exists:', !!credentialsJson);
  console.log('[GCS] GCP_SERVICE_ACCOUNT_KEY length:', credentialsJson?.length || 0);

  if (credentialsJson) {
    try {
      const credentials = JSON.parse(credentialsJson);
      console.log('[GCS] Successfully parsed credentials for project:', credentials.project_id);
      console.log('[GCS] Service account email:', credentials.client_email);

      return new Storage({
        projectId: process.env.GCP_PROJECT_ID || credentials.project_id,
        credentials,
      });
    } catch (e: any) {
      console.error('[GCS] Failed to parse GCP_SERVICE_ACCOUNT_KEY:', e.message);
      console.error('[GCS] First 100 chars of value:', credentialsJson?.substring(0, 100));
    }
  } else {
    console.warn('[GCS] GCP_SERVICE_ACCOUNT_KEY not found, falling back to default auth');
  }

  // Fallback to default credentials (for local development with GOOGLE_APPLICATION_CREDENTIALS file)
  return new Storage({
    projectId: process.env.GCP_PROJECT_ID,
  });
}

// Create new instance each time to avoid caching issues in serverless
export function getStorage(): Storage {
  return getStorageClient();
}

export function getStorageBucket() {
  const bucketName = process.env.GCP_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('GCP_STORAGE_BUCKET environment variable is not set');
  }
  return getStorage().bucket(bucketName);
}
