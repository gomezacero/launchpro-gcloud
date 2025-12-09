import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AdRuleLevel, AdRuleMetric, AdRuleOperator, AdRuleAction } from '@prisma/client';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/rules/[id]
 * Get a single rule with its execution history
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    logger.info('api', `GET /api/rules/${id}`);

    const rule = await prisma.adRule.findUnique({
      where: { id },
      include: {
        metaAccount: {
          select: {
            id: true,
            name: true,
            metaAdAccountId: true,
          },
        },
        tonicAccount: {
          select: {
            id: true,
            name: true,
            accountType: true,
          },
        },
        executions: {
          take: 50,
          orderBy: { executedAt: 'desc' },
        },
      },
    });

    if (!rule) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched rule: ${rule.name}`, { ruleId: id }, duration);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error: any) {
    logger.error('api', `Error fetching rule: ${error.message}`, {
      ruleId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/rules/[id]
 * Update an existing rule
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    const body = await request.json();

    logger.info('api', `PUT /api/rules/${id}`, { updates: Object.keys(body) });

    // Verify rule exists
    const existingRule = await prisma.adRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }

    // Validate enums if provided
    if (body.level && !Object.values(AdRuleLevel).includes(body.level)) {
      return NextResponse.json(
        { success: false, error: `Invalid level: ${body.level}` },
        { status: 400 }
      );
    }

    if (body.metric && !Object.values(AdRuleMetric).includes(body.metric)) {
      return NextResponse.json(
        { success: false, error: `Invalid metric: ${body.metric}` },
        { status: 400 }
      );
    }

    if (body.operator && !Object.values(AdRuleOperator).includes(body.operator)) {
      return NextResponse.json(
        { success: false, error: `Invalid operator: ${body.operator}` },
        { status: 400 }
      );
    }

    if (body.action && !Object.values(AdRuleAction).includes(body.action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${body.action}` },
        { status: 400 }
      );
    }

    // Build update data
    const updateData: any = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.level !== undefined) updateData.level = body.level;
    if (body.targetIds !== undefined) updateData.targetIds = body.targetIds;
    if (body.applyToAllCampaigns !== undefined) updateData.applyToAllCampaigns = body.applyToAllCampaigns;
    if (body.specificCampaignIds !== undefined) {
      updateData.specificCampaignIds = body.applyToAllCampaigns ? [] : (body.specificCampaignIds || []);
    }
    if (body.metaAccountId !== undefined) updateData.metaAccountId = body.metaAccountId;
    if (body.metric !== undefined) updateData.metric = body.metric;
    if (body.operator !== undefined) updateData.operator = body.operator;
    if (body.value !== undefined) updateData.value = parseFloat(body.value);
    if (body.valueMin !== undefined) updateData.valueMin = body.valueMin !== null ? parseFloat(body.valueMin) : null;
    if (body.valueMax !== undefined) updateData.valueMax = body.valueMax !== null ? parseFloat(body.valueMax) : null;
    if (body.frequencyHours !== undefined) updateData.frequencyHours = body.frequencyHours;
    if (body.timeWindow !== undefined) updateData.timeWindow = body.timeWindow;
    if (body.action !== undefined) updateData.action = body.action;
    if (body.actionValue !== undefined) updateData.actionValue = body.actionValue !== null ? parseFloat(body.actionValue) : null;
    if (body.actionValueType !== undefined) updateData.actionValueType = body.actionValueType;
    if (body.notifyEmails !== undefined) updateData.notifyEmails = body.notifyEmails;
    if (body.scheduleHours !== undefined) updateData.scheduleHours = body.scheduleHours;
    if (body.scheduleDays !== undefined) updateData.scheduleDays = body.scheduleDays;
    if (body.cooldownMinutes !== undefined) updateData.cooldownMinutes = body.cooldownMinutes;
    if (body.maxExecutions !== undefined) updateData.maxExecutions = body.maxExecutions;

    // Handle ROAS-specific fields
    const metricToUse = body.metric !== undefined ? body.metric : existingRule.metric;
    if (metricToUse === 'ROAS') {
      if (body.tonicAccountId !== undefined) updateData.tonicAccountId = body.tonicAccountId;
      if (body.roasDateRange !== undefined) updateData.roasDateRange = body.roasDateRange;
    } else {
      // Clear ROAS fields if metric is not ROAS
      if (body.metric !== undefined && body.metric !== 'ROAS') {
        updateData.tonicAccountId = null;
        updateData.roasDateRange = null;
      }
    }

    const rule = await prisma.adRule.update({
      where: { id },
      data: updateData,
      include: {
        metaAccount: {
          select: {
            id: true,
            name: true,
            metaAdAccountId: true,
          },
        },
        tonicAccount: {
          select: {
            id: true,
            name: true,
            accountType: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Rule updated: ${rule.name}`, { ruleId: id }, duration);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error: any) {
    logger.error('api', `Error updating rule: ${error.message}`, {
      ruleId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/rules/[id]
 * Delete a rule
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id } = await params;

  try {
    logger.info('api', `DELETE /api/rules/${id}`);

    // Verify rule exists
    const existingRule = await prisma.adRule.findUnique({
      where: { id },
    });

    if (!existingRule) {
      return NextResponse.json(
        { success: false, error: 'Rule not found' },
        { status: 404 }
      );
    }

    // Delete the rule (executions will be cascade deleted)
    await prisma.adRule.delete({
      where: { id },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Rule deleted: ${existingRule.name}`, { ruleId: id }, duration);

    return NextResponse.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error: any) {
    logger.error('api', `Error deleting rule: ${error.message}`, {
      ruleId: id,
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
