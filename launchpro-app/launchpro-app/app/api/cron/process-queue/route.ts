import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignOrchestrator } from '@/services/campaign-orchestrator.service';
import { CampaignStatus } from '@prisma/client';

// DEPLOYMENT VERSION - Used to verify which code version is running
const CODE_VERSION = 'v2.4.0-fresh-client-2026-01-25';

/**
 * Cron Job: Process Campaign Queue
 *
 * Runs every minute via Vercel Cron
 * Processes ONE campaign at a time from the queue (FIFO)
 * Only starts a new campaign if NO campaign is currently being processed
 *
 * CRITICAL: This ensures only ONE campaign is ever in the "launch pipeline"
 * at any given time, preventing all concurrency-related errors (401s, race conditions).
 *
 * Queue Flow:
 * 1. Check if any campaign is currently being processed (PENDING_ARTICLE, GENERATING_AI, etc.)
 * 2. If YES → do nothing, wait for current campaign to finish
 * 3. If NO → pick the oldest QUEUED campaign and start processing
 */

export const maxDuration = 60;

// Statuses that indicate a campaign is currently being processed
// If ANY campaign has one of these statuses, the queue is BLOCKED
const PROCESSING_STATUSES = [
  CampaignStatus.PENDING_ARTICLE,
  CampaignStatus.AWAITING_TRACKING,
  CampaignStatus.ARTICLE_APPROVED,
  CampaignStatus.GENERATING_AI,
  CampaignStatus.LAUNCHING,
];

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify cron secret (Vercel sends this header)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log(`[process-queue] CODE_VERSION: ${CODE_VERSION}`);
    logger.info('system', `🔄 [CRON] Starting process-queue job... (${CODE_VERSION})`);

    // ============================================
    // Step 1: Check if ANY campaign is currently being processed
    // ============================================
    const processingCampaign = await prisma.campaign.findFirst({
      where: {
        status: { in: PROCESSING_STATUSES },
      },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' }, // Show the one that's been processing longest
    });

    if (processingCampaign) {
      const minutesSinceUpdate = Math.floor(
        (Date.now() - new Date(processingCampaign.updatedAt).getTime()) / (1000 * 60)
      );

      logger.info('system', `⏳ [CRON] Queue blocked - campaign "${processingCampaign.name}" is in ${processingCampaign.status} status (${minutesSinceUpdate}min since last update)`, {
        campaignId: processingCampaign.id,
        status: processingCampaign.status,
        updatedAt: processingCampaign.updatedAt,
        minutesSinceUpdate,
      });

      // Count how many campaigns are waiting in queue
      const queueCount = await prisma.campaign.count({
        where: { status: CampaignStatus.QUEUED },
      });

      return NextResponse.json({
        success: true,
        message: 'Queue blocked - campaign is currently processing',
        currentlyProcessing: {
          id: processingCampaign.id,
          name: processingCampaign.name,
          status: processingCampaign.status,
          minutesSinceUpdate,
        },
        queueLength: queueCount,
      });
    }

    // ============================================
    // Step 2: No campaign is processing - get the next QUEUED campaign (FIFO)
    // ============================================
    const nextCampaign = await prisma.campaign.findFirst({
      where: {
        status: CampaignStatus.QUEUED,
      },
      orderBy: [
        { queueOrder: 'asc' },  // Priority order first (if set, lower = higher priority)
        { queuedAt: 'asc' },    // Then by queue time (FIFO)
        { createdAt: 'asc' },   // Fallback to creation time
      ],
      include: {
        platforms: {
          include: { tonicAccount: true },
        },
        offer: true,
      },
    });

    if (!nextCampaign) {
      logger.info('system', '✅ [CRON] Queue is empty - no campaigns waiting');
      return NextResponse.json({
        success: true,
        message: 'Queue is empty',
        queueLength: 0,
      });
    }

    // Calculate queue position (for logging)
    const queuePosition = await prisma.campaign.count({
      where: {
        status: CampaignStatus.QUEUED,
        OR: [
          { queueOrder: { lt: nextCampaign.queueOrder ?? 999999 } },
          {
            queueOrder: nextCampaign.queueOrder,
            queuedAt: { lt: nextCampaign.queuedAt ?? nextCampaign.createdAt },
          },
        ],
      },
    });

    logger.info('system', `📋 [CRON] Next campaign in queue: "${nextCampaign.name}" (position ${queuePosition + 1})`, {
      campaignId: nextCampaign.id,
      queuedAt: nextCampaign.queuedAt,
      queueOrder: nextCampaign.queueOrder,
    });

    // ============================================
    // Step 3: Atomic claim - prevent race conditions
    // ============================================
    const claimed = await prisma.campaign.updateMany({
      where: {
        id: nextCampaign.id,
        status: CampaignStatus.QUEUED, // Must still be QUEUED
      },
      data: {
        status: CampaignStatus.PENDING_ARTICLE,
      },
    });

    if (claimed.count === 0) {
      logger.info('system', `⏭️ [CRON] Campaign "${nextCampaign.name}" already claimed by another process`);
      return NextResponse.json({
        success: true,
        message: 'Campaign already claimed by another process',
      });
    }

    logger.info('system', `🚀 [CRON] Starting campaign "${nextCampaign.name}" from queue`, {
      campaignId: nextCampaign.id,
      queuedAt: nextCampaign.queuedAt,
    });

    // ============================================
    // Step 4: Start campaign processing (submit article to Tonic)
    // ============================================
    try {
      await campaignOrchestrator.startCampaign(nextCampaign.id);

      const duration = Date.now() - startTime;
      logger.success('system', `✅ [CRON] Campaign "${nextCampaign.name}" started successfully (${duration}ms)`);

      // Count remaining campaigns in queue
      const queueCount = await prisma.campaign.count({
        where: { status: CampaignStatus.QUEUED },
      });

      return NextResponse.json({
        success: true,
        message: `Started campaign "${nextCampaign.name}" from queue`,
        startedCampaign: {
          id: nextCampaign.id,
          name: nextCampaign.name,
        },
        remainingInQueue: queueCount,
        duration,
      });

    } catch (startError: any) {
      // If start fails, mark as FAILED so the queue isn't blocked
      await prisma.campaign.update({
        where: { id: nextCampaign.id },
        data: {
          status: CampaignStatus.FAILED,
          errorDetails: {
            step: 'queue-start',
            message: startError.message,
            timestamp: new Date().toISOString(),
            technicalDetails: startError.stack?.substring(0, 500),
          },
        },
      });

      logger.error('system', `❌ [CRON] Failed to start campaign "${nextCampaign.name}": ${startError.message}`);

      // Count remaining campaigns in queue
      const queueCount = await prisma.campaign.count({
        where: { status: CampaignStatus.QUEUED },
      });

      return NextResponse.json({
        success: false,
        error: startError.message,
        failedCampaign: {
          id: nextCampaign.id,
          name: nextCampaign.name,
        },
        remainingInQueue: queueCount,
      }, { status: 500 });
    }

  } catch (error: any) {
    logger.error('system', `❌ [CRON] process-queue failed: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
