import { NextRequest, NextResponse } from 'next/server';
import { designflowService, CreateDesignTaskParams } from '@/services/designflow.service';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { CampaignStatus } from '@prisma/client';

/**
 * POST /api/designflow/tasks
 * Create a new design task in DesignFlow and link it to a LaunchPro campaign
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // Validate required fields
    const { campaignId, requester } = body;

    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: 'campaignId is required' },
        { status: 400 }
      );
    }

    if (!requester) {
      return NextResponse.json(
        { success: false, error: 'requester is required' },
        { status: 400 }
      );
    }

    logger.info('api', `[DesignFlow] Creating task for campaign: ${campaignId}`);

    // Get campaign details from database
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        offer: true,
        platforms: true,
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check if task already exists for this campaign
    const existingTask = await prisma.designFlowTask.findUnique({
      where: { campaignId },
    });

    if (existingTask) {
      return NextResponse.json(
        {
          success: false,
          error: 'A DesignFlow task already exists for this campaign',
          existingTaskId: existingTask.designflowTaskId,
        },
        { status: 409 }
      );
    }

    // Prepare task params
    const taskParams: CreateDesignTaskParams = {
      campaignName: campaign.name,
      campaignId: campaign.id,
      offerId: campaign.offerId,
      offerName: campaign.offer?.name,
      country: campaign.country,
      language: campaign.language,
      platforms: campaign.platforms.map((p) => p.platform),
      budget: campaign.platforms[0]?.budget || undefined,
      copyMaster: campaign.copyMaster || undefined,
      communicationAngle: campaign.communicationAngle || undefined,
      keywords: campaign.keywords || undefined,
      startDate: campaign.platforms[0]?.startDate?.toISOString().split('T')[0],
      requester,
      priority: body.priority || 'Normal',
      referenceLinks: body.referenceLinks || [],
    };

    // Create task in DesignFlow
    const designFlowTask = await designflowService.createTask(taskParams);

    // Save task reference in LaunchPro database
    await prisma.designFlowTask.create({
      data: {
        campaignId: campaign.id,
        designflowTaskId: designFlowTask.id,
        status: designFlowTask.status,
        title: designFlowTask.title,
        requester,
      },
    });

    // Update campaign status to AWAITING_DESIGN
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.AWAITING_DESIGN },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `[DesignFlow] Task created: ${designFlowTask.id}`, {
      campaignId,
      taskId: designFlowTask.id,
      requester,
    }, duration);

    return NextResponse.json({
      success: true,
      data: {
        taskId: designFlowTask.id,
        title: designFlowTask.title,
        status: designFlowTask.status,
        sprint: designFlowTask.sprint,
        campaignStatus: CampaignStatus.AWAITING_DESIGN,
      },
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `[DesignFlow] Error creating task: ${error.message}`, {
      stack: error.stack,
    }, duration);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to create DesignFlow task',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/designflow/tasks?campaignId=xxx
 * Get DesignFlow task status for a campaign
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('campaignId');
    const taskId = searchParams.get('taskId');

    if (!campaignId && !taskId) {
      return NextResponse.json(
        { success: false, error: 'campaignId or taskId is required' },
        { status: 400 }
      );
    }

    let designFlowTaskRecord;

    if (campaignId) {
      designFlowTaskRecord = await prisma.designFlowTask.findUnique({
        where: { campaignId },
      });
    } else if (taskId) {
      designFlowTaskRecord = await prisma.designFlowTask.findUnique({
        where: { designflowTaskId: taskId },
      });
    }

    if (!designFlowTaskRecord) {
      return NextResponse.json(
        { success: false, error: 'DesignFlow task not found' },
        { status: 404 }
      );
    }

    // Get latest status from DesignFlow
    const latestTask = await designflowService.getTaskById(designFlowTaskRecord.designflowTaskId);

    if (latestTask) {
      // Update local record if status changed
      if (latestTask.status !== designFlowTaskRecord.status) {
        await prisma.designFlowTask.update({
          where: { id: designFlowTaskRecord.id },
          data: {
            status: latestTask.status,
            deliveryLink: latestTask.deliveryLink,
            completedAt: latestTask.status === 'Done' ? new Date() : null,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: designFlowTaskRecord.id,
        designflowTaskId: designFlowTaskRecord.designflowTaskId,
        campaignId: designFlowTaskRecord.campaignId,
        status: latestTask?.status || designFlowTaskRecord.status,
        title: designFlowTaskRecord.title,
        requester: designFlowTaskRecord.requester,
        deliveryLink: latestTask?.deliveryLink || designFlowTaskRecord.deliveryLink,
        sentAt: designFlowTaskRecord.sentAt,
        completedAt: designFlowTaskRecord.completedAt,
      },
    });
  } catch (error: any) {
    logger.error('api', `[DesignFlow] Error getting task: ${error.message}`);

    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get DesignFlow task',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/designflow/tasks/requesters
 * Get available requesters from DesignFlow
 */
export async function OPTIONS(request: NextRequest) {
  try {
    const requesters = await designflowService.getRequesters();

    return NextResponse.json({
      success: true,
      data: requesters,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get requesters',
      },
      { status: 500 }
    );
  }
}
