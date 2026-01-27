import { z } from 'zod';

/**
 * Environment Variables Validation Schema
 *
 * Este esquema valida todas las variables de entorno requeridas para LaunchPro.
 *
 * ARQUITECTURA MULTI-CUENTA:
 * - Las credenciales de Tonic se gestionan por cuenta en la base de datos
 * - Meta y TikTok usan tokens compartidos para acceder a múltiples cuentas
 * - Los IDs de cuenta por defecto son opcionales (fallback)
 */
const envSchema = z.object({
  // ============================================================================
  // DATABASE
  // ============================================================================
  DATABASE_URL: z.string().url(),

  // ============================================================================
  // TONIC API
  // ============================================================================
  // NOTA: Las credenciales de Tonic ahora se gestionan en la tabla Account.
  // Estas variables son OPCIONALES y solo para compatibilidad legacy.
  TONIC_API_USERNAME: z.string().min(1).optional(),
  TONIC_API_PASSWORD: z.string().min(1).optional(),
  TONIC_API_BASE_URL: z.string().url().default('https://api.publisher.tonic.com'),

  // ============================================================================
  // META ADS API
  // ============================================================================
  // Un token de acceso puede gestionar múltiples cuentas publicitarias
  META_ACCESS_TOKEN: z.string().min(1),
  // Cuenta por defecto (opcional, usado como fallback)
  META_AD_ACCOUNT_ID: z.string().min(1).optional(),
  // Credenciales de app (opcionales, para crear píxeles)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_API_VERSION: z.string().default('v21.0'),

  // ============================================================================
  // TIKTOK ADS API
  // ============================================================================
  // Un token de acceso puede gestionar múltiples cuentas de anunciante
  TIKTOK_ACCESS_TOKEN: z.string().min(1),
  // Cuenta por defecto (opcional, usado como fallback)
  TIKTOK_ADVERTISER_ID: z.string().min(1).optional(),
  // Credenciales de app (opcionales, para crear píxeles)
  TIKTOK_APP_ID: z.string().optional(),
  TIKTOK_APP_SECRET: z.string().optional(),
  TIKTOK_PIXEL_ID: z.string().optional(),

  // ============================================================================
  // TABOOLA BACKSTAGE API
  // ============================================================================
  // Credentials for Taboola Realize (Backstage API)
  // Token expires after 12 hours
  TABOOLA_CLIENT_ID: z.string().optional(),
  TABOOLA_CLIENT_SECRET: z.string().optional(),
  // Default account ID (optional, usually discovered via API)
  TABOOLA_ACCOUNT_ID: z.string().optional(),

  // ============================================================================
  // AI SERVICES
  // ============================================================================
  // v2.9.0: Anthropic is NO LONGER USED - all AI uses Gemini
  // Keeping this as optional for backwards compatibility with env vars
  ANTHROPIC_API_KEY: z.string().optional(),

  // Gemini API Key (primary AI provider)
  GEMINI_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  // Google Cloud Platform - Vertex AI para generación de media
  GCP_PROJECT_ID: z.string().min(1),
  GCP_LOCATION: z.string().default('us-central1'),
  GCP_STORAGE_BUCKET: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),

  // ============================================================================
  // APPLICATION
  // ============================================================================
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================
  ENABLE_AI_CONTENT_GENERATION: z.string().default('true'),
  ENABLE_IMAGE_GENERATION: z.string().default('true'),
  ENABLE_VIDEO_GENERATION: z.string().default('true'),

  // Neural Engine - Multi-agent system for creative generation
  // When 'true': Uses 5-agent pipeline (Global Scout → Asset Manager → Angle Strategist → Visual Engineer → Compliance Assembler)
  // When 'false': Uses traditional AI service (current behavior)
  ENABLE_NEURAL_ENGINE: z.string().default('false'),

  // ============================================================================
  // DESIGNFLOW INTEGRATION
  // ============================================================================
  // Supabase credentials for DesignFlow (design task management)
  DESIGNFLOW_SUPABASE_URL: z.string().url().optional(),
  DESIGNFLOW_SUPABASE_ANON_KEY: z.string().optional(),
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
