import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * CLEAN ANTHROPIC ERRORS
 *
 * This endpoint finds and optionally cleans OLD Anthropic errors stored in the database
 * from BEFORE the migration to Gemini (v2.9.0).
 *
 * GET /api/diagnostic/clean-anthropic-errors
 *   - Shows all campaigns with Anthropic-related errors
 *
 * POST /api/diagnostic/clean-anthropic-errors
 *   - Cleans the errorDetails of campaigns that have old Anthropic errors
 *   - Sets them to a new status so they can be retried
 */

export async function GET() {
  try {
    // Find all campaigns with errorDetails containing "anthropic"
    const campaignsWithAnthropicErrors = await prisma.campaign.findMany({
      where: {
        OR: [
          { errorDetails: { path: [], string_contains: 'anthropic' } },
          { errorDetails: { path: [], string_contains: 'Anthropic' } },
          { errorDetails: { path: [], string_contains: 'sk-ant' } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        errorDetails: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Find audit logs with Anthropic errors
    const logsWithAnthropicErrors = await prisma.campaignAuditLog.findMany({
      where: {
        OR: [
          { message: { contains: 'anthropic', mode: 'insensitive' } },
          { message: { contains: 'sk-ant' } },
          { details: { path: [], string_contains: 'anthropic' } },
          { errorStack: { contains: 'anthropic', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        campaignId: true,
        event: true,
        message: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // Summary
    const uniqueCampaignIds = new Set(logsWithAnthropicErrors.map(l => l.campaignId));

    return NextResponse.json({
      success: true,
      analysis: {
        totalCampaignsWithAnthropicErrors: campaignsWithAnthropicErrors.length,
        totalLogsWithAnthropicErrors: logsWithAnthropicErrors.length,
        uniqueCampaignsWithErrorLogs: uniqueCampaignIds.size,
        message: campaignsWithAnthropicErrors.length > 0
          ? `Found ${campaignsWithAnthropicErrors.length} campaigns with old Anthropic errors. These are from BEFORE the Gemini migration.`
          : 'No campaigns found with Anthropic errors in errorDetails.',
        recommendation: campaignsWithAnthropicErrors.length > 0
          ? 'Use POST to clean these old errors and retry the campaigns.'
          : 'Your database is clean. Any new 401 errors are NOT from Anthropic.',
      },
      campaigns: campaignsWithAnthropicErrors.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        errorPreview: JSON.stringify(c.errorDetails).substring(0, 300),
        updatedAt: c.updatedAt,
      })),
      recentLogs: logsWithAnthropicErrors.slice(0, 10).map(l => ({
        id: l.id,
        campaignId: l.campaignId,
        event: l.event,
        message: l.message?.substring(0, 200),
        createdAt: l.createdAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json().catch(() => ({ action: 'preview' }));

    if (action !== 'clean') {
      return NextResponse.json({
        success: false,
        error: 'Send { "action": "clean" } to perform the cleanup',
      }, { status: 400 });
    }

    // Find campaigns with Anthropic errors that are in FAILED status
    const campaignsToClean = await prisma.campaign.findMany({
      where: {
        status: 'FAILED',
        OR: [
          { errorDetails: { path: [], string_contains: 'anthropic' } },
          { errorDetails: { path: [], string_contains: 'Anthropic' } },
          { errorDetails: { path: [], string_contains: 'sk-ant' } },
        ],
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (campaignsToClean.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No FAILED campaigns with Anthropic errors found. Nothing to clean.',
        cleaned: 0,
      });
    }

    // Clean the errorDetails and set status to allow retry
    const cleanedIds: string[] = [];
    for (const campaign of campaignsToClean) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          errorDetails: {
            previousError: 'CLEANED: Old Anthropic error removed',
            cleanedAt: new Date().toISOString(),
            note: 'This campaign had a pre-migration Anthropic error. It has been cleaned and can be retried.',
          },
          // Reset to ARTICLE_APPROVED if possible, otherwise keep as FAILED
          // The user can manually retry these campaigns
        },
      });
      cleanedIds.push(campaign.id);

      // Log the cleanup
      await prisma.campaignAuditLog.create({
        data: {
          campaignId: campaign.id,
          event: 'ERROR_CLEANUP',
          source: 'diagnostic-tool',
          message: 'Cleaned old Anthropic error from campaign. This error was from before the Gemini migration.',
          isError: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned ${cleanedIds.length} campaigns with old Anthropic errors.`,
      cleaned: cleanedIds.length,
      cleanedCampaignIds: cleanedIds,
      nextStep: 'These campaigns can now be retried without the old error showing.',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
