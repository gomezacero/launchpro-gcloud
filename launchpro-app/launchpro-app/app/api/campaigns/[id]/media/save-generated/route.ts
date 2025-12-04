import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Save AI-generated media to database
 * POST /api/campaigns/[id]/media/save-generated
 *
 * Used when images are generated during the wizard phase and need to be saved
 * to the campaign's media collection.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { gcsPath, url, mediaType, platform, prompt } = body;

    logger.info('api', `Saving AI-generated ${mediaType} for campaign ${campaignId}`, {
      gcsPath,
      platform,
    });

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Extract filename from gcsPath (e.g., "campaigns/xxx/media/image-xxx.png" -> "image-xxx.png")
    const extractedFileName = gcsPath ? gcsPath.split('/').pop() : `ai-generated-${Date.now()}.png`;

    // Save to database
    const media = await prisma.media.create({
      data: {
        campaignId,
        type: mediaType || 'IMAGE',
        generatedByAI: true,
        url: url,
        gcsPath: gcsPath,
        aiPrompt: prompt || null,
        fileName: extractedFileName,
        mimeType: 'image/png', // AI-generated images are always PNG
        aiModel: 'imagen-4.0-fast-generate-001',
      },
    });

    logger.success('api', `AI-generated media saved`, {
      mediaId: media.id,
      campaignId,
      type: mediaType,
      gcsPath,
    });

    return NextResponse.json({
      success: true,
      data: {
        mediaId: media.id,
        id: media.id,
      },
      media: {
        id: media.id,
        url: url,
        type: mediaType,
        gcsPath: gcsPath,
      },
    });
  } catch (error: any) {
    logger.error('api', `Failed to save AI-generated media: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to save AI-generated media',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
