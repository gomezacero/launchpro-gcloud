import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getStorage } from '@/lib/gcs';

/**
 * Confirm a direct upload to GCS and register the media in the database
 * POST /api/campaigns/[id]/media/confirm
 *
 * Called after the frontend has successfully uploaded a file directly to GCS
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { gcsPath, fileName, fileSize, fileType, mediaType, platform, linkedVideoId } = body;

    logger.info('api', `✅ Confirming upload for campaign ${campaignId}`, {
      gcsPath,
      fileName,
      mediaType,
    });

    // Verify campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Verify file exists in GCS
    const storage = getStorage();
    const bucket = storage.bucket(env.GCP_STORAGE_BUCKET);
    const file = bucket.file(gcsPath);

    const [exists] = await file.exists();
    if (!exists) {
      return NextResponse.json(
        { error: 'File not found in storage. Upload may have failed.' },
        { status: 400 }
      );
    }

    // Generate signed URL for reading (valid for 7 days)
    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Save to database
    const media = await prisma.media.create({
      data: {
        campaignId,
        type: mediaType,
        generatedByAI: false, // Manual upload
        url: signedUrl,
        gcsPath: gcsPath,
        fileName: fileName,
        fileSize: fileSize || 0,
        mimeType: fileType,
      },
    });

    logger.success('api', `✅ Media registered in DB`, {
      mediaId: media.id,
      campaignId,
      type: mediaType,
    });

    // If this is a thumbnail, link it to the video
    if (linkedVideoId && mediaType === 'IMAGE') {
      await prisma.media.update({
        where: { id: linkedVideoId },
        data: { thumbnailMediaId: media.id },
      });
      logger.info('api', `🔗 Linked thumbnail ${media.id} to video ${linkedVideoId}`);
    }

    return NextResponse.json({
      success: true,
      data: {
        mediaId: media.id,
        id: media.id,
      },
      media: {
        id: media.id,
        url: signedUrl,
        type: mediaType,
        fileName: fileName,
        fileSize: fileSize,
        mimeType: fileType,
      },
    });
  } catch (error: any) {
    logger.error('api', `Failed to confirm upload: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        error: 'Failed to confirm upload',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
