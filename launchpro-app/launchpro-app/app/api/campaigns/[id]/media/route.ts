import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Storage } from '@google-cloud/storage';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

/**
 * Upload media files (images/videos) for a campaign
 * POST /api/campaigns/[id]/media
 *
 * Supports:
 * - Manual file upload from user's computer
 * - Stores in Google Cloud Storage
 * - Associates with campaign
 * - Complies with Meta/TikTok format requirements
 */

const storage = new Storage({
  projectId: env.GCP_PROJECT_ID,
});

// Meta Ads Image Requirements:
// - Format: JPG, PNG
// - Aspect Ratio: 1:1 (square), 4:5, 9:16
// - Min size: 600x600px
// - Max file size: 30MB

// Meta Ads Video Requirements:
// - Format: MP4, MOV
// - Aspect Ratio: 1:1, 4:5, 9:16
// - Duration: 1 second - 241 minutes
// - Max file size: 4GB
// - Codec: H.264, VP8

// TikTok Ads Image Requirements:
// - Format: JPG, JPEG, PNG
// - Aspect Ratio: 9:16 (recommended), 1:1, 16:9
// - File size: 50KB - 500KB

// TikTok Ads Video Requirements:
// - Format: MP4, MOV, MPEG, AVI, FLV, 3GP, WEBM
// - Aspect Ratio: 9:16 (recommended), 1:1, 16:9
// - Duration: 5-60 seconds
// - Max file size: 500MB
// - Resolution: Min 540x960px, Max 1920x1080px

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    logger.info('api', `📤 Uploading media for campaign ${campaignId}`);

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

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const mediaType = formData.get('type') as 'IMAGE' | 'VIDEO';
    const platform = formData.get('platform') as 'META' | 'TIKTOK' | null; // Optional
    const linkedVideoId = formData.get('linkedVideoId') as string | null; // For linking thumbnails to videos

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!mediaType || !['IMAGE', 'VIDEO'].includes(mediaType)) {
      return NextResponse.json(
        { error: 'Invalid media type. Must be IMAGE or VIDEO' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    const allowedVideoTypes = [
      'video/mp4',
      'video/quicktime', // MOV
      'video/mpeg',
      'video/avi',
      'video/x-flv',
      'video/3gpp',
      'video/webm',
    ];

    if (mediaType === 'IMAGE' && !allowedImageTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid image format. Allowed: JPG, PNG. Got: ${file.type}` },
        { status: 400 }
      );
    }

    if (mediaType === 'VIDEO' && !allowedVideoTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid video format. Allowed: MP4, MOV, MPEG, AVI, FLV, 3GP, WEBM. Got: ${file.type}`,
        },
        { status: 400 }
      );
    }

    // Validate file size
    const maxImageSize = 30 * 1024 * 1024; // 30MB (Meta limit)
    const maxVideoSize = 500 * 1024 * 1024; // 500MB (TikTok limit)

    if (mediaType === 'IMAGE' && file.size > maxImageSize) {
      return NextResponse.json(
        { error: `Image too large. Max size: 30MB. Got: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      );
    }

    if (mediaType === 'VIDEO' && file.size > maxVideoSize) {
      return NextResponse.json(
        { error: `Video too large. Max size: 500MB. Got: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      );
    }

    logger.info('system', `✅ File validation passed`, {
      fileName: file.name,
      type: file.type,
      size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
    });

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(7);
    const extension = file.name.split('.').pop();
    const folder = mediaType === 'IMAGE' ? 'uploaded-images' : 'uploaded-videos';
    const fileName = `${folder}/${timestamp}-${randomString}.${extension}`;

    // Upload to Google Cloud Storage
    const bucket = storage.bucket(env.GCP_STORAGE_BUCKET);
    const gcsFile = bucket.file(fileName);

    await gcsFile.save(buffer, {
      contentType: file.type,
      metadata: {
        metadata: {
          campaignId,
          mediaType,
          platform: platform || 'unknown',
          originalFileName: file.name,
          uploadedAt: new Date().toISOString(),
        },
      },
    });

    logger.success('system', `📁 File uploaded to GCS: ${fileName}`);

    // Generate signed URL (valid for 7 days)
    const [signedUrl] = await gcsFile.getSignedUrl({
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
        gcsPath: fileName,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });

    logger.success('api', `✅ Media uploaded and saved to DB`, {
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
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      },
    });
  } catch (error: any) {
    logger.error('api', `Failed to upload media: ${error.message}`, {
      error: error.message,
      stack: error.stack,
    });

    return NextResponse.json(
      {
        error: 'Failed to upload media',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Get all media for a campaign
 * GET /api/campaigns/[id]/media
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    const media = await prisma.media.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      media,
    });
  } catch (error: any) {
    logger.error('api', `Failed to get media: ${error.message}`);

    return NextResponse.json(
      {
        error: 'Failed to get media',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Delete media
 * DELETE /api/campaigns/[id]/media
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const { searchParams } = new URL(request.url);
    const mediaId = searchParams.get('mediaId');

    if (!mediaId) {
      return NextResponse.json(
        { error: 'mediaId is required' },
        { status: 400 }
      );
    }

    // Get media
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      return NextResponse.json(
        { error: 'Media not found' },
        { status: 404 }
      );
    }

    if (media.campaignId !== campaignId) {
      return NextResponse.json(
        { error: 'Media does not belong to this campaign' },
        { status: 403 }
      );
    }

    // Delete from Google Cloud Storage
    if (media.gcsPath) {
      const bucket = storage.bucket(env.GCP_STORAGE_BUCKET);
      const file = bucket.file(media.gcsPath);
      await file.delete();
      logger.info('system', `Deleted file from GCS: ${media.gcsPath}`);
    }

    // Delete from database
    await prisma.media.delete({
      where: { id: mediaId },
    });

    logger.success('api', `Media deleted successfully`, { mediaId });

    return NextResponse.json({
      success: true,
      message: 'Media deleted successfully',
    });
  } catch (error: any) {
    logger.error('api', `Failed to delete media: ${error.message}`);

    return NextResponse.json(
      {
        error: 'Failed to delete media',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
