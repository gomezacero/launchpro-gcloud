import { NextRequest, NextResponse } from 'next/server';
import { complianceService } from '@/services/compliance.service';
import { requireAuth } from '@/lib/auth-utils';
import { logger } from '@/lib/logger';

export const maxDuration = 60;

/**
 * POST /api/compliance/ads/[id]/appeal
 * Send an appeal request for a declined ad
 *
 * Body:
 * - campaignId: The campaign ID associated with the ad
 * - message: Appeal message (10-500 characters)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth();
    if (error) return error;

    const { id: adId } = await params;
    const body = await request.json();

    const { campaignId, message } = body;

    // Validation
    if (!campaignId) {
      return NextResponse.json(
        { success: false, error: 'campaignId is required' },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'message is required' },
        { status: 400 }
      );
    }

    if (typeof message !== 'string') {
      return NextResponse.json(
        { success: false, error: 'message must be a string' },
        { status: 400 }
      );
    }

    if (message.length < 10) {
      return NextResponse.json(
        { success: false, error: 'Message must be at least 10 characters' },
        { status: 400 }
      );
    }

    if (message.length > 500) {
      return NextResponse.json(
        { success: false, error: 'Message must be at most 500 characters' },
        { status: 400 }
      );
    }

    logger.info('api', `POST /api/compliance/ads/${adId}/appeal - User: ${user!.email}`, {
      campaignId,
      messageLength: message.length,
    });

    const result = await complianceService.sendAppeal(
      adId,
      parseInt(campaignId, 10),
      message
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Appeal sent successfully',
    });
  } catch (error: any) {
    logger.error('api', `Error sending appeal: ${error.message}`, { error });
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
