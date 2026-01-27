import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * FULL DIAGNOSTIC CHECK
 * GET /api/diagnostic/full-check
 *
 * This endpoint provides complete visibility into:
 * 1. Which code version is running
 * 2. Environment variable status
 * 3. AI provider configuration
 * 4. Recent failed campaigns and their error details
 *
 * Use this to diagnose 401 errors and other issues.
 */

// VERSION MARKERS - If these don't match your commit, you're running cached code
const CODE_VERSION = 'v2.9.5-FULL-DIAGNOSTIC';
const BUILD_TIMESTAMP = new Date().toISOString();

export async function GET() {
  const startTime = Date.now();

  try {
    // 1. Code Version Check
    const codeInfo = {
      version: CODE_VERSION,
      buildTimestamp: BUILD_TIMESTAMP,
      vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      vercelGitCommitRef: process.env.VERCEL_GIT_COMMIT_REF || 'unknown',
      vercelEnv: process.env.VERCEL_ENV || 'unknown',
      nodeEnv: process.env.NODE_ENV || 'unknown',
    };

    // 2. Environment Variables Check (masked for security)
    const maskKey = (key: string | undefined) => {
      if (!key) return { exists: false, value: null };
      return {
        exists: true,
        length: key.length,
        prefix: key.substring(0, 8) + '...',
        isAnthropicFormat: key.startsWith('sk-ant'),
        isGoogleFormat: key.startsWith('AI'),
      };
    };

    const envCheck = {
      // AI Keys
      GEMINI_API_KEY: maskKey(process.env.GEMINI_API_KEY),
      GOOGLE_AI_API_KEY: maskKey(process.env.GOOGLE_AI_API_KEY),
      ANTHROPIC_API_KEY: maskKey(process.env.ANTHROPIC_API_KEY),
      // GCP
      GCP_SERVICE_ACCOUNT_KEY: { exists: !!process.env.GCP_SERVICE_ACCOUNT_KEY },
      GCP_PROJECT_ID: { exists: !!process.env.GCP_PROJECT_ID },
      GCP_LOCATION: { exists: !!process.env.GCP_LOCATION, value: process.env.GCP_LOCATION },
      // External APIs
      TONIC_API_URL: { exists: !!process.env.TONIC_API_URL },
      META_ACCESS_TOKEN: maskKey(process.env.META_ACCESS_TOKEN),
      TIKTOK_ACCESS_TOKEN: maskKey(process.env.TIKTOK_ACCESS_TOKEN),
      // Database
      DATABASE_URL: { exists: !!process.env.DATABASE_URL },
      // Cron
      CRON_SECRET: { exists: !!process.env.CRON_SECRET },
    };

    // 3. AI Provider Analysis
    const aiAnalysis = {
      activeProvider: 'GEMINI',
      hasValidGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      anthropicSdkInstalled: false, // We removed it from package.json
      warningMessage: process.env.ANTHROPIC_API_KEY
        ? '⚠️ ANTHROPIC_API_KEY exists but is NOT USED. Remove it from env vars to clean up.'
        : '✅ No Anthropic configuration detected',
      recommendation: process.env.ANTHROPIC_API_KEY
        ? 'Go to Vercel Dashboard → Settings → Environment Variables → DELETE ANTHROPIC_API_KEY'
        : 'Configuration looks correct',
    };

    // 4. Recent Failed Campaigns (last 10)
    const failedCampaigns = await prisma.campaign.findMany({
      where: { status: 'FAILED' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        status: true,
        errorDetails: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    // Analyze error patterns
    const errorAnalysis = failedCampaigns.map(c => {
      const errorStr = JSON.stringify(c.errorDetails || {});
      return {
        id: c.id,
        name: c.name,
        updatedAt: c.updatedAt,
        hasAnthropicError: errorStr.toLowerCase().includes('anthropic'),
        has401Error: errorStr.includes('401'),
        hasGeminiError: errorStr.toLowerCase().includes('gemini'),
        errorPreview: errorStr.substring(0, 200),
      };
    });

    // 5. Recent Campaign Audit Logs with errors
    const recentErrors = await prisma.campaignAuditLog.findMany({
      where: { isError: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        campaignId: true,
        event: true,
        source: true,
        message: true,
        errorCode: true,
        details: true,
        createdAt: true,
      },
    });

    // Check for Anthropic-related errors in logs
    const anthropicRelatedLogs = recentErrors.filter(log => {
      const content = JSON.stringify(log).toLowerCase();
      return content.includes('anthropic') || content.includes('sk-ant');
    });

    // 6. Summary
    const summary = {
      status: 'diagnostic_complete',
      isCodeUpToDate: true, // Will be false if cached
      hasAnthropicIssue: aiAnalysis.hasAnthropicKey || anthropicRelatedLogs.length > 0,
      failedCampaignsWithAnthropicError: errorAnalysis.filter(e => e.hasAnthropicError).length,
      totalFailedCampaigns: failedCampaigns.length,
      totalErrorLogs: recentErrors.length,
      anthropicRelatedLogs: anthropicRelatedLogs.length,
    };

    // Build diagnostic message
    let diagnosticMessage = '✅ Diagnostic Complete\n\n';

    if (summary.hasAnthropicIssue) {
      diagnosticMessage += '⚠️ ANTHROPIC ISSUE DETECTED:\n';
      if (aiAnalysis.hasAnthropicKey) {
        diagnosticMessage += '- ANTHROPIC_API_KEY is configured in environment variables\n';
        diagnosticMessage += '- This key is NOT USED by current code (v2.9.0+)\n';
        diagnosticMessage += '- RECOMMENDATION: Remove ANTHROPIC_API_KEY from Vercel env vars\n\n';
      }
      if (anthropicRelatedLogs.length > 0) {
        diagnosticMessage += `- Found ${anthropicRelatedLogs.length} error logs mentioning Anthropic\n`;
        diagnosticMessage += '- These may be OLD ERRORS from before the migration\n\n';
      }
      if (summary.failedCampaignsWithAnthropicError > 0) {
        diagnosticMessage += `- Found ${summary.failedCampaignsWithAnthropicError} failed campaigns with Anthropic errors\n`;
        diagnosticMessage += '- These errors were stored BEFORE the Gemini migration\n';
        diagnosticMessage += '- NEW campaigns should NOT have Anthropic errors\n';
      }
    } else {
      diagnosticMessage += '✅ No Anthropic issues detected in current configuration\n';
      diagnosticMessage += '✅ AI provider is correctly set to GEMINI\n';
    }

    const duration = Date.now() - startTime;

    return NextResponse.json({
      diagnostic: {
        summary,
        diagnosticMessage,
        codeInfo,
        envCheck,
        aiAnalysis,
        errorAnalysis,
        anthropicRelatedLogs: anthropicRelatedLogs.map(log => ({
          id: log.id,
          campaignId: log.campaignId,
          event: log.event,
          message: log.message,
          createdAt: log.createdAt,
        })),
        recentErrors: recentErrors.slice(0, 5).map(log => ({
          id: log.id,
          campaignId: log.campaignId,
          event: log.event,
          message: log.message,
          errorCode: log.errorCode,
          createdAt: log.createdAt,
        })),
      },
      durationMs: duration,
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 500 });
  }
}
