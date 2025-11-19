import { z } from 'zod';

// Environment variables validation schema
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Tonic
  TONIC_API_USERNAME: z.string().min(1),
  TONIC_API_PASSWORD: z.string().min(1),
  TONIC_API_BASE_URL: z.string().url().default('https://api.publisher.tonic.com'),

  // Meta
  META_ACCESS_TOKEN: z.string().min(1),
  META_AD_ACCOUNT_ID: z.string().min(1),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),

  // TikTok
  TIKTOK_ACCESS_TOKEN: z.string().min(1),
  TIKTOK_ADVERTISER_ID: z.string().min(1),
  TIKTOK_APP_ID: z.string().optional(),
  TIKTOK_APP_SECRET: z.string().optional(),
  TIKTOK_PIXEL_ID: z.string().optional(),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1),

  // Google Cloud
  GCP_PROJECT_ID: z.string().min(1),
  GCP_LOCATION: z.string().default('us-central1'),
  GCP_STORAGE_BUCKET: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // Features
  ENABLE_AI_CONTENT_GENERATION: z.string().default('true'),
  ENABLE_IMAGE_GENERATION: z.string().default('true'),
  ENABLE_VIDEO_GENERATION: z.string().default('true'),
});

export type Env = z.infer<typeof envSchema>;

// Parse and validate environment variables
export function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((e) => e.path.join('.')).join(', ');
      throw new Error(`Missing or invalid environment variables: ${missingVars}`);
    }
    throw error;
  }
}

// Export validated env (use with caution, only after validation)
export const env = envSchema.parse(process.env);
