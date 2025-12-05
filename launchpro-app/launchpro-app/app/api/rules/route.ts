import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AdRuleLevel, AdRuleMetric, AdRuleOperator, AdRuleAction } from '@prisma/client';

/**
 * GET /api/rules
 * Get all ad rules
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const metaAccountId = searchParams.get('metaAccountId');
    const isActive = searchParams.get('isActive');

    logger.info('api', 'GET /api/rules', { metaAccountId, isActive });

    const where: any = {};

    if (metaAccountId) {
      where.metaAccountId = metaAccountId;
    }

    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const rules = await prisma.adRule.findMany({
      where,
      include: {
        metaAccount: {
          select: {
            id: true,
            name: true,
            metaAdAccountId: true,
          },
        },
        specificCampaign: {
          select: {
            id: true,
            name: true,
          },
        },
        executions: {
          take: 5,
          orderBy: { executedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${rules.length} rules`, { count: rules.length }, duration);

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching rules: ${error.message}`, {
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/rules
 * Create a new ad rule
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('api', 'POST /api/rules - Creating new rule', {
      name: body.name,
      level: body.level,
      metric: body.metric,
      action: body.action,
    });

    // Validate required fields
    const requiredFields = ['name', 'metaAccountId', 'level', 'metric', 'operator', 'value', 'action'];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate level enum
    if (!Object.values(AdRuleLevel).includes(body.level)) {
      return NextResponse.json(
        { success: false, error: `Invalid level: ${body.level}` },
        { status: 400 }
      );
    }

    // Validate metric enum
    if (!Object.values(AdRuleMetric).includes(body.metric)) {
      return NextResponse.json(
        { success: false, error: `Invalid metric: ${body.metric}` },
        { status: 400 }
      );
    }

    // Validate operator enum
    if (!Object.values(AdRuleOperator).includes(body.operator)) {
      return NextResponse.json(
        { success: false, error: `Invalid operator: ${body.operator}` },
        { status: 400 }
      );
    }

    // Validate action enum
    if (!Object.values(AdRuleAction).includes(body.action)) {
      return NextResponse.json(
        { success: false, error: `Invalid action: ${body.action}` },
        { status: 400 }
      );
    }

    // Validate BETWEEN/NOT_BETWEEN have min and max
    if ((body.operator === 'BETWEEN' || body.operator === 'NOT_BETWEEN') &&
        (body.valueMin === undefined || body.valueMax === undefined)) {
      return NextResponse.json(
        { success: false, error: 'BETWEEN and NOT_BETWEEN operators require valueMin and valueMax' },
        { status: 400 }
      );
    }

    // Validate budget actions have actionValue
    if ((body.action === 'INCREASE_BUDGET' || body.action === 'DECREASE_BUDGET') &&
        (body.actionValue === undefined || body.actionValue === null)) {
      return NextResponse.json(
        { success: false, error: 'Budget actions require actionValue' },
        { status: 400 }
      );
    }

    // Verify Meta account exists
    const metaAccount = await prisma.account.findUnique({
      where: { id: body.metaAccountId },
    });

    if (!metaAccount) {
      return NextResponse.json(
        { success: false, error: 'Meta account not found' },
        { status: 404 }
      );
    }

    // Validate campaign scope
    if (!body.applyToAllCampaigns && !body.specificCampaignId) {
      return NextResponse.json(
        { success: false, error: 'Must select a specific campaign or apply to all campaigns' },
        { status: 400 }
      );
    }

    // Verify specific campaign exists if selected
    if (body.specificCampaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: { id: body.specificCampaignId },
      });
      if (!campaign) {
        return NextResponse.json(
          { success: false, error: 'Selected campaign not found' },
          { status: 404 }
        );
      }
    }

    // Create the rule
    const rule = await prisma.adRule.create({
      data: {
        name: body.name,
        isActive: body.isActive ?? true,
        level: body.level as AdRuleLevel,
        targetIds: body.targetIds || [],
        applyToAllCampaigns: body.applyToAllCampaigns ?? false,
        specificCampaignId: body.applyToAllCampaigns ? null : (body.specificCampaignId || null),
        metaAccountId: body.metaAccountId,
        metric: body.metric as AdRuleMetric,
        operator: body.operator as AdRuleOperator,
        value: parseFloat(body.value),
        valueMin: body.valueMin !== undefined ? parseFloat(body.valueMin) : null,
        valueMax: body.valueMax !== undefined ? parseFloat(body.valueMax) : null,
        frequencyHours: body.frequencyHours || 3,
        timeWindow: body.timeWindow || 'TODAY', // Keep for backward compatibility
        action: body.action as AdRuleAction,
        actionValue: body.actionValue !== undefined ? parseFloat(body.actionValue) : null,
        actionValueType: body.actionValueType || null,
        notifyEmails: body.notifyEmails || [],
        scheduleHours: body.scheduleHours || [],
        scheduleDays: body.scheduleDays || [],
        cooldownMinutes: body.cooldownMinutes || 60,
        maxExecutions: body.maxExecutions ?? null,
      },
      include: {
        metaAccount: {
          select: {
            id: true,
            name: true,
            metaAdAccountId: true,
          },
        },
        specificCampaign: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Rule created: ${rule.name}`, { ruleId: rule.id }, duration);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error creating rule: ${error.message}`, {
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
