/**
 * Video Converter Service
 * Converts images to video format for TikTok ads (which only support video in PLACEMENT_TIKTOK)
 */
import * as ffmpegModule from 'fluent-ffmpeg';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { getStorage } from '@/lib/gcs';

// Handle module imports for CommonJS/ESM compatibility
const ffmpeg = (ffmpegModule as any).default || ffmpegModule;

// Find FFmpeg binary path manually (Next.js bundling breaks ffmpeg-static's path resolution)
function findFfmpegPath(): string {
  // Try multiple possible locations
  const possiblePaths = [
    // Direct path in node_modules (most common)
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'),
    // Fallback to global ffmpeg if available
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  ];

  for (const ffmpegPath of possiblePaths) {
    if (fs.existsSync(ffmpegPath)) {
      console.log(`[VIDEO-CONVERTER] Found FFmpeg at: ${ffmpegPath}`);
      return ffmpegPath;
    }
  }

  // Last resort: try to use ffmpeg-static module (might work in some environments)
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      console.log(`[VIDEO-CONVERTER] Found FFmpeg via module at: ${ffmpegStatic}`);
      return ffmpegStatic;
    }
  } catch (e) {
    // Module not available or path invalid
  }

  throw new Error('FFmpeg binary not found. Please install ffmpeg-static or ensure FFmpeg is in PATH.');
}

// Set FFmpeg path
try {
  const ffmpegPath = findFfmpegPath();
  ffmpeg.setFfmpegPath(ffmpegPath);
} catch (error: any) {
  console.error(`[VIDEO-CONVERTER] Warning: ${error.message}`);
}

// Logger helper
const logger = {
  info: (tag: string, message: string, data?: any) => {
    console.log(`[${tag}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  success: (tag: string, message: string, data?: any) => {
    console.log(`✅ [${tag}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (tag: string, message: string, data?: any) => {
    console.error(`❌ [${tag}] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

interface ConvertedVideo {
  localPath: string;
  fileName: string;
  gcsUrl?: string;
  gcsPath?: string;
  duration: number;
  width: number;
  height: number;
}

class VideoConverterService {
  private storage: Storage;
  private bucketName: string;

  constructor() {
    this.storage = getStorage();
    this.bucketName = process.env.GCP_STORAGE_BUCKET || process.env.GCS_BUCKET_NAME || 'launchpro-media';
  }

  /**
   * Convert an image to a video for TikTok
   * TikTok requirements:
   * - Aspect ratio: 9:16 (vertical), 1:1, or 16:9
   * - Resolution: 720x1280 minimum (we'll use 1080x1920 for quality)
   * - Duration: 5-60 seconds (we'll use 15 seconds)
   * - Format: MP4, MOV, MPEG, AVI
   * - Codec: H.264
   */
  async convertImageToVideo(imageUrl: string, originalFileName: string): Promise<ConvertedVideo> {
    logger.info('VIDEO-CONVERTER', `Converting image to video for TikTok...`, { imageUrl, originalFileName });

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);

    // Temp file paths
    const inputImagePath = path.join(tempDir, `input_${timestamp}_${randomStr}.jpg`);
    const outputVideoPath = path.join(tempDir, `output_${timestamp}_${randomStr}.mp4`);
    const outputFileName = originalFileName.replace(/\.[^/.]+$/, '') + `_tiktok_video_${timestamp}.mp4`;

    try {
      // Step 1: Download the image from URL (GCS signed URL or direct URL)
      logger.info('VIDEO-CONVERTER', 'Downloading image...');
      await this.downloadFile(imageUrl, inputImagePath);
      logger.success('VIDEO-CONVERTER', `Image downloaded to: ${inputImagePath}`);

      // Step 2: Convert image to video using FFmpeg
      logger.info('VIDEO-CONVERTER', 'Converting to video (15 seconds, 1080x1920, H.264)...');
      await this.createVideoFromImage(inputImagePath, outputVideoPath);
      logger.success('VIDEO-CONVERTER', `Video created: ${outputVideoPath}`);

      // Step 3: Upload to GCS
      logger.info('VIDEO-CONVERTER', 'Uploading converted video to GCS...');
      const gcsPath = `converted-videos/${outputFileName}`;
      const gcsUrl = await this.uploadToGCS(outputVideoPath, gcsPath);
      logger.success('VIDEO-CONVERTER', `Video uploaded to GCS: ${gcsUrl}`);

      // Clean up temp files
      this.cleanupTempFile(inputImagePath);
      // Keep outputVideoPath for now as TikTok might need it

      return {
        localPath: outputVideoPath,
        fileName: outputFileName,
        gcsUrl,
        gcsPath,
        duration: 15,
        width: 1080,
        height: 1920,
      };
    } catch (error: any) {
      // Clean up on error
      this.cleanupTempFile(inputImagePath);
      this.cleanupTempFile(outputVideoPath);

      logger.error('VIDEO-CONVERTER', `Failed to convert image to video: ${error.message}`);
      throw new Error(`Video conversion failed: ${error.message}`);
    }
  }

  /**
   * Download a file from URL to local path
   */
  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
    });

    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  }

  /**
   * Create a video from a static image using FFmpeg
   * - Duration: 15 seconds
   * - Resolution: 1080x1920 (9:16 vertical for TikTok)
   * - Codec: H.264 (libx264)
   * - Adds a subtle zoom effect for engagement
   */
  private createVideoFromImage(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputOptions([
          '-loop', '1', // Loop the image
        ])
        .outputOptions([
          '-c:v', 'libx264', // H.264 codec
          '-t', '15', // Duration: 15 seconds
          '-pix_fmt', 'yuv420p', // Pixel format for compatibility
          '-r', '30', // 30 FPS
          '-preset', 'medium', // Encoding speed/quality balance
          '-crf', '23', // Quality (lower = better, 23 is good balance)
        ])
        // Scale and pad to 1080x1920 (9:16) while preserving aspect ratio
        .videoFilters([
          'scale=1080:1920:force_original_aspect_ratio=decrease',
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
          // Add subtle zoom effect (Ken Burns effect) for engagement
          'zoompan=z=\'min(zoom+0.0005,1.1)\':x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\':d=450:s=1080x1920:fps=30',
        ])
        .on('start', (commandLine: string) => {
          logger.info('VIDEO-CONVERTER', `FFmpeg command: ${commandLine}`);
        })
        .on('progress', (progress: { percent?: number }) => {
          if (progress.percent) {
            logger.info('VIDEO-CONVERTER', `Conversion progress: ${Math.round(progress.percent)}%`);
          }
        })
        .on('end', () => {
          logger.success('VIDEO-CONVERTER', 'Video conversion completed');
          resolve();
        })
        .on('error', (err: Error) => {
          logger.error('VIDEO-CONVERTER', `FFmpeg error: ${err.message}`);
          reject(err);
        })
        .save(outputPath);
    });
  }

  /**
   * Upload file to Google Cloud Storage
   */
  private async uploadToGCS(localPath: string, gcsPath: string): Promise<string> {
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(gcsPath);

    await bucket.upload(localPath, {
      destination: gcsPath,
      metadata: {
        contentType: 'video/mp4',
      },
    });

    // Generate signed URL for the uploaded video
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return signedUrl;
  }

  /**
   * Clean up temporary file
   */
  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('VIDEO-CONVERTER', `Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  /**
   * Clean up the converted video file after upload to TikTok
   */
  cleanupConvertedVideo(localPath: string): void {
    this.cleanupTempFile(localPath);
  }
}

export const videoConverterService = new VideoConverterService();
