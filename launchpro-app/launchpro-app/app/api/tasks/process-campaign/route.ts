/**
 * ============================================================================
 * Cloud Tasks Handler: Process Campaign
 * ============================================================================
 *
 * Este endpoint es llamado por Cloud Tasks para procesar una campaña completa.
 * Coordina generación de contenido AI y lanzamiento a plataformas.
 *
 * @route POST /api/tasks/process-campaign
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { campaignLogger } from '@/lib/campaign-logger';
import {
  isCloudTasksRequest,
  getTaskRetryInfo,
  type TaskPayload,
} from '@/lib/cloud-tasks';
import { orchestratorV2 } from '@/services/campaign-orchestrator-v2.service';
import { CampaignStatus } from '@prisma/client';

const PROCESSING_TIMEOUT_MS = 14 * 60 * 1000; // 14 minutos

export async function POST(request: Request) {
  const startTime = Date.now();

  if (!isCloudTasksRequest(request)) {
    logger.warn('cloud-tasks', 'Unauthorized request to process-campaign endpoint');
    return NextResponse.json(
      { error: 'Unauthorized - This endpoint only accepts Cloud Tasks requests' },
      { status: 401 }
    );
  }

  const retryInfo = getTaskRetryInfo(request);

  try {
    const payload: TaskPayload = await request.json();
    const { campaignId } = payload;

    if (!campaignId) {
      return NextResponse.json({ error: 'Missing campaignId' }, { status: 400 });
    }

    logger.info('cloud-tasks', `[process-campaign] Starting`, {
      campaignId,
      attempt: retryInfo.retryCount + 1,
    });

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const processableStates: CampaignStatus[] = [
      CampaignStatus.GENERATING_AI,
      CampaignStatus.LAUNCHING,
      CampaignStatus.AWAITING_TRACKING,
    ];

    if (!processableStates.includes(campaign.status)) {
      return NextResponse.json({
        success: true,
        message: `Campaign is in ${campaign.status} state, skipping`,
      });
    }

    campaignLogger.startStep(campaignId, 'meta_campaign', 'Processing campaign');

    // Procesar con timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Processing timeout')), PROCESSING_TIMEOUT_MS);
    });

    const result = await Promise.race([
      orchestratorV2.processCampaign(campaignId),
      timeoutPromise,
    ]) as Awaited<ReturnType<typeof orchestratorV2.processCampaign>>;

    const processingTime = Date.now() - startTime;

    if (result.success) {
      logger.success('cloud-tasks', `[process-campaign] Completed`, {
        campaignId,
        processingTimeMs: processingTime,
      });

      campaignLogger.complete(campaignId, 'Campaign processed successfully');

      return NextResponse.json({
        success: true,
        status: 'COMPLETED',
        processingTimeMs: processingTime,
        platformResults: result.platformResults,
      });

    } else {
      logger.error('cloud-tasks', `[process-campaign] Failed`, {
        campaignId,
        errors: result.errors,
      });

      campaignLogger.completeWithError(campaignId, result.errors?.join('; ') || 'Processing failed');

      if (retryInfo.retryCount < 2) {
        return NextResponse.json(
          { error: result.errors?.join('; '), willRetry: true },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: false,
        status: 'FAILED',
        errors: result.errors,
        processingTimeMs: processingTime,
      });
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const processingTime = Date.now() - startTime;

    logger.error('cloud-tasks', `[process-campaign] Error`, {
      error: errorMessage,
      processingTimeMs: processingTime,
    });

    return NextResponse.json(
      { error: errorMessage, processingTimeMs: processingTime },
      { status: 500 }
    );
  }
}
