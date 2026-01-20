import { NextRequest, NextResponse } from 'next/server';
import { getStorageBucket } from '@/lib/gcs';
import { logger } from '@/lib/logger';
import { v4 as uuid } from 'uuid';

/**
 * Upload reference image for Neural Engine style guidance
 * POST /api/upload/reference-image
 *
 * This endpoint allows users to upload a reference image that the
 * Visual Engineer Agent will analyze to better understand the desired
 * visual style for AI image generation.
 *
 * Supports: JPG, PNG, WebP
 * Max size: 5MB
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type. Allowed: JPG, PNG, WebP. Got: ${file.type}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File too large. Max size: 5MB. Got: ${(file.size / (1024 * 1024)).toFixed(2)}MB` },
        { status: 400 }
      );
    }

    logger.info('api', `📤 Uploading reference image: ${file.name} (${file.type}, ${(file.size / 1024).toFixed(1)}KB)`);

    // Generate unique filename
    const extension = file.name.split('.').pop() || 'jpg';
    const filename = `reference-images/${uuid()}.${extension}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to GCS
    const bucket = getStorageBucket();
    const gcsFile = bucket.file(filename);

    await gcsFile.save(buffer, {
      contentType: file.type,
      metadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
        purpose: 'neural-engine-reference',
      },
    });

    // Generate signed URL (valid for 7 days)
    const [signedUrl] = await gcsFile.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Also get the public URL (for Gemini to access)
    // Note: The bucket needs to be configured for public access or we use the signed URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    logger.success('api', `✅ Reference image uploaded: ${filename}`);

    return NextResponse.json({
      success: true,
      url: signedUrl,
      gcsPath: filename,
      publicUrl,
    });

  } catch (error: any) {
    logger.error('api', `Error uploading reference image: ${error.message}`, { error });

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to upload image' },
      { status: 500 }
    );
  }
}
