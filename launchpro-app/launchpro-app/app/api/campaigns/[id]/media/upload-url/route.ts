import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getStorage } from '@/lib/gcs';

/**
 * Get a signed URL for direct upload to Google Cloud Storage
 * POST /api/campaigns/[id]/media/upload-url
 *
 * This allows uploading large files (up to 500MB) directly to GCS,
 * bypassing Vercel's serverless function size limits.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();
    const { fileName, fileType, mediaType, platform } = body;

    logger.info('api', `📝 Generating upload URL for campaign ${campaignId}`, {
      fileName,
      fileType,
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

    // Validate media type
    if (!mediaType || !['IMAGE', 'VIDEO'].includes(mediaType)) {
      return NextResponse.json(
        { error: 'Invalid media type. Must be IMAGE or VIDEO' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = fileName.split('.').pop();
    const folder = mediaType === 'IMAGE' ? 'uploaded-images' : 'uploaded-videos';
    const gcsFileName = `${folder}/${timestamp}-${randomString}.${extension}`;

    // Get signed URL for upload
    const storage = getStorage();
    const bucket = storage.bucket(env.GCP_STORAGE_BUCKET);
    const file = bucket.file(gcsFileName);

    const [uploadUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      contentType: fileType,
    });

    logger.success('api', `✅ Upload URL generated for ${gcsFileName}`);

    return NextResponse.json({
      success: true,
      data: {
        uploadUrl,
        gcsPath: gcsFileName,
        fileName: fileName,
        fileType: fileType,
        mediaType: mediaType,
        platform: platform,
      },
    });
  } catch (error: any) {
    logger.error('api', `Failed to generate upload URL: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        error: 'Failed to generate upload URL',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
