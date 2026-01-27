import { NextResponse } from 'next/server';

// VERSION MARKER - This helps verify which code is actually running
const DEPLOYMENT_VERSION = 'v2.9.3-NEURAL-ENGINE-RAI-FIX';
const DEPLOYMENT_TIMESTAMP = '2026-01-27T04:00:00Z';

export async function GET() {
  return NextResponse.json({
    version: DEPLOYMENT_VERSION,
    deployedAt: DEPLOYMENT_TIMESTAMP,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    commitRef: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
    vercelEnv: process.env.VERCEL_ENV || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    aiProvider: 'GEMINI-ONLY',
    anthropicSdkInstalled: false, // We removed it from package.json
    checks: {
      geminiKeyExists: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
      anthropicKeyExists: !!process.env.ANTHROPIC_API_KEY,
    },
    message: 'If you see this, deployment v2.9.3 is running with Neural Engine RAI filtering fix',
  });
}
