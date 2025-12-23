import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AdRuleLevel, AdRuleMetric, AdRuleOperator, AdRuleAction } from '@prisma/client';

/**
 * GET /api/tiktok-rules
 * Get all TikTok ad rules
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { searchParams } = new URL(request.url);
    const tiktokAccountId = searchParams.get('tiktokAccountId');
    const isActive = searchParams.get('isActive');

    logger.info('api', 'GET /api/tiktok-rules', { tiktokAccountId, isActive });

    const where: any = {
      platform: 'TIKTOK', // Only TikTok rules
    };

    if (tiktokAccountId) {
      where.tiktokAccountId = tiktokAccountId;
    }

    if (isActive !== null && isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const rules = await prisma.adRule.findMany({
      where,
      include: {
        tiktokAccount: {
          select: {
            id: true,
            name: true,
            tiktokAdvertiserId: true,
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
          take: 5,
          orderBy: { executedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const duration = Date.now() - startTime;
    logger.success('api', `Fetched ${rules.length} TikTok rules`, { count: rules.length }, duration);

    return NextResponse.json({
      success: true,
      data: rules,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error fetching TikTok rules: ${error.message}`, {
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tiktok-rules
 * Create a new TikTok ad rule
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    logger.info('api', 'POST /api/tiktok-rules - Creating new TikTok rule', {
      name: body.name,
      level: body.level,
      metric: body.metric,
      action: body.action,
    });

    // Validate required fields
    const requiredFields = ['name', 'tiktokAccountId', 'level', 'metric', 'operator', 'value', 'action'];
    for (const field of requiredFields) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return NextResponse.json(
          { success: false, error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate level enum (TikTok uses AD_GROUP instead of AD_SET)
    const validLevels = ['CAMPAIGN', 'AD_GROUP', 'AD'];
    if (!validLevels.includes(body.level)) {
      return NextResponse.json(
        { success: false, error: `Invalid level: ${body.level}. Valid levels for TikTok: ${validLevels.join(', ')}` },
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

    // Verify TikTok account exists
    const tiktokAccount = await prisma.account.findUnique({
      where: { id: body.tiktokAccountId },
    });

    if (!tiktokAccount || tiktokAccount.accountType !== 'TIKTOK') {
      return NextResponse.json(
        { success: false, error: 'TikTok account not found or invalid type' },
        { status: 404 }
      );
    }

    // Validate campaign scope
    const campaignIds = body.specificCampaignIds || [];
    if (!body.applyToAllCampaigns && campaignIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Must select at least one campaign or apply to all campaigns' },
        { status: 400 }
      );
    }

    // Validate ROAS metric requires Tonic account and date range
    if (body.metric === 'ROAS') {
      if (!body.tonicAccountId) {
        return NextResponse.json(
          { success: false, error: 'ROAS metric requires a Tonic account to be selected' },
          { status: 400 }
        );
      }
      if (!body.roasDateRange) {
        return NextResponse.json(
          { success: false, error: 'ROAS metric requires a date range to be selected' },
          { status: 400 }
        );
      }

      // Verify Tonic account exists
      const tonicAccount = await prisma.account.findUnique({
        where: { id: body.tonicAccountId },
      });
      if (!tonicAccount || tonicAccount.accountType !== 'TONIC') {
        return NextResponse.json(
          { success: false, error: 'Tonic account not found or invalid type' },
          { status: 404 }
        );
      }
    }

    // Create the rule
    const rule = await prisma.adRule.create({
      data: {
        name: body.name,
        isActive: body.isActive ?? true,
        platform: 'TIKTOK', // Mark as TikTok rule
        level: body.level as AdRuleLevel,
        targetIds: body.targetIds || [],
        applyToAllCampaigns: body.applyToAllCampaigns ?? false,
        specificCampaignIds: body.applyToAllCampaigns ? [] : (body.specificCampaignIds || []),
        tiktokAccountId: body.tiktokAccountId,
        // Tonic account for ROAS calculation (required for TikTok since it doesn't provide ROAS)
        tonicAccountId: body.metric === 'ROAS' ? body.tonicAccountId : null,
        roasDateRange: body.metric === 'ROAS' ? body.roasDateRange : null,
        metric: body.metric as AdRuleMetric,
        operator: body.operator as AdRuleOperator,
        value: parseFloat(body.value),
        valueMin: body.valueMin !== undefined ? parseFloat(body.valueMin) : null,
        valueMax: body.valueMax !== undefined ? parseFloat(body.valueMax) : null,
        frequencyHours: body.frequencyHours || 3,
        timeWindow: body.timeWindow || 'TODAY',
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
        tiktokAccount: {
          select: {
            id: true,
            name: true,
            tiktokAdvertiserId: true,
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
    logger.success('api', `TikTok rule created: ${rule.name}`, { ruleId: rule.id }, duration);

    return NextResponse.json({
      success: true,
      data: rule,
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    logger.error('api', `Error creating TikTok rule: ${error.message}`, {
      stack: error.stack,
    });

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
