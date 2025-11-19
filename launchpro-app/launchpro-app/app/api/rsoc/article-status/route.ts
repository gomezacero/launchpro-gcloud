import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { tonicService } from '@/services/tonic.service';
import { logger } from '@/lib/logger';

/**
 * Check RSOC Article Request Status
 *
 * GET /api/rsoc/article-status?requestId=210699&accountId=xxx
 *
 * Returns the current status of an RSOC article request
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');
    const accountId = searchParams.get('accountId');

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing requestId parameter' },
        { status: 400 }
      );
    }

    if (!accountId) {
      return NextResponse.json(
        { error: 'Missing accountId parameter' },
        { status: 400 }
      );
    }

    logger.info('api', `Checking article request status...`, { requestId, accountId });

    // Get Tonic account credentials
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        tonicConsumerKey: true,
        tonicConsumerSecret: true,
      },
    });

    if (!account || !account.tonicConsumerKey || !account.tonicConsumerSecret) {
      return NextResponse.json(
        { error: 'Tonic account not found or missing credentials' },
        { status: 404 }
      );
    }

    const credentials = {
      consumer_key: account.tonicConsumerKey,
      consumer_secret: account.tonicConsumerSecret,
    };

    // Fetch article request status from Tonic API
    const articleRequest = await tonicService.getArticleRequest(
      credentials,
      parseInt(requestId)
    );

    logger.success('api', `Article request status retrieved`, {
      requestId,
      status: articleRequest.request_status,
      headlineId: articleRequest.headline_id,
    });

    return NextResponse.json({
      success: true,
      data: {
        requestId: articleRequest.request_id,
        headlineId: articleRequest.headline_id,
        status: articleRequest.request_status,
        rejectionReason: articleRequest.rejection_reason,
        offer: articleRequest.offer,
        country: articleRequest.country,
        language: articleRequest.language,
        contentGenerationPhrases: articleRequest.content_generation_phrases,
        // Status explanations
        statusExplanation: getStatusExplanation(articleRequest.request_status),
        canBeUsed: articleRequest.request_status === 'published' && articleRequest.headline_id !== null,
      },
    });
  } catch (error: any) {
    logger.error('api', `Failed to check article status: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}

function getStatusExplanation(status: string): string {
  const explanations: Record<string, string> = {
    pending: '⏳ Article is waiting for Tonic review. This usually takes a few minutes to hours.',
    in_review: '👀 Article is currently being reviewed by Tonic team.',
    published: '✅ Article has been approved and is ready to use! You can create campaigns with this headline_id.',
    rejected: '❌ Article was rejected by Tonic. Check rejection_reason for details. You may need to create a new article request.',
  };

  return explanations[status] || `ℹ️  Status: ${status}`;
}
