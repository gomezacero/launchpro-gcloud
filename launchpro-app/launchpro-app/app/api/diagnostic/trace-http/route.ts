import { NextResponse } from 'next/server';
import axios from 'axios';

/**
 * HTTP TRACE DIAGNOSTIC
 * GET /api/diagnostic/trace-http
 *
 * This endpoint intercepts axios to see what HTTP calls are being made.
 * It helps diagnose where the Anthropic-formatted 401 error is coming from.
 */

export async function GET() {
  const httpCalls: Array<{
    method: string;
    url: string;
    headers: Record<string, string>;
    timestamp: string;
  }> = [];

  // Intercept axios requests
  const interceptorId = axios.interceptors.request.use((config) => {
    httpCalls.push({
      method: config.method?.toUpperCase() || 'UNKNOWN',
      url: config.url || 'UNKNOWN',
      headers: config.headers as Record<string, string>,
      timestamp: new Date().toISOString(),
    });
    return config;
  });

  try {
    // Check what URLs are configured
    const configuredUrls = {
      TIKTOK_API: 'https://business-api.tiktok.com/open_api/v1.3',
      META_API: `https://graph.facebook.com/${process.env.META_API_VERSION || 'v21.0'}`,
      TONIC_API: process.env.TONIC_API_BASE_URL || 'https://api.publisher.tonic.com',
      GEMINI_API: 'https://generativelanguage.googleapis.com',
    };

    // Check environment
    const envCheck = {
      GEMINI_API_KEY: {
        exists: !!process.env.GEMINI_API_KEY,
        prefix: process.env.GEMINI_API_KEY?.substring(0, 8),
        length: process.env.GEMINI_API_KEY?.length,
      },
      TIKTOK_ACCESS_TOKEN: {
        exists: !!process.env.TIKTOK_ACCESS_TOKEN,
        prefix: process.env.TIKTOK_ACCESS_TOKEN?.substring(0, 8),
        length: process.env.TIKTOK_ACCESS_TOKEN?.length,
      },
      META_ACCESS_TOKEN: {
        exists: !!process.env.META_ACCESS_TOKEN,
        prefix: process.env.META_ACCESS_TOKEN?.substring(0, 8),
        length: process.env.META_ACCESS_TOKEN?.length,
      },
      // Check for any unexpected keys
      ANTHROPIC_API_KEY: {
        exists: !!process.env.ANTHROPIC_API_KEY,
        WARNING: process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY IS SET - REMOVE IT!' : null,
      },
      OPENAI_API_KEY: {
        exists: !!process.env.OPENAI_API_KEY,
      },
    };

    // Check for any environment variables that contain "anthropic"
    const suspiciousEnvVars: string[] = [];
    for (const key of Object.keys(process.env)) {
      if (key.toLowerCase().includes('anthropic') || key.toLowerCase().includes('claude')) {
        suspiciousEnvVars.push(key);
      }
    }

    // Check Node.js version and runtime
    const runtimeInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      vercelEnv: process.env.VERCEL_ENV,
      vercelRegion: process.env.VERCEL_REGION,
    };

    // Analysis
    const analysis = {
      possibleCauses: [] as string[],
      recommendations: [] as string[],
    };

    if (suspiciousEnvVars.length > 0) {
      analysis.possibleCauses.push(`Found suspicious env vars: ${suspiciousEnvVars.join(', ')}`);
      analysis.recommendations.push('Remove all Anthropic-related environment variables from Vercel');
    }

    if (process.env.ANTHROPIC_API_KEY) {
      analysis.possibleCauses.push('ANTHROPIC_API_KEY is configured - but code does not use it');
      analysis.recommendations.push('Delete ANTHROPIC_API_KEY from Vercel environment variables');
    }

    // The critical analysis
    analysis.possibleCauses.push(
      'The 401 error with Anthropic format suggests a request is being made to api.anthropic.com',
      'This could be from: cached code, a dependency, or a proxy/middleware'
    );

    analysis.recommendations.push(
      '1. Check if there is any proxy or API gateway in front of your APIs',
      '2. Check Vercel project settings for any rewrites or redirects',
      '3. Check if there is any browser extension or network tool intercepting requests',
      '4. Try a completely fresh Vercel project deployment'
    );

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      configuredUrls,
      envCheck,
      suspiciousEnvVars,
      runtimeInfo,
      analysis,
      message: 'This endpoint helps trace HTTP calls. The Anthropic-formatted error is very suspicious because there is NO Anthropic code in this project.',
    });
  } finally {
    // Clean up interceptor
    axios.interceptors.request.eject(interceptorId);
  }
}
