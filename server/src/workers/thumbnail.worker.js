import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, isS3Configured } from '../services/s3Service.js';
import jobLogger from '../utils/jobLogger.js';

// Disable Sharp file caching on Windows to prevent EBUSY handle locking
sharp.cache(false);

// Configure static FFmpeg binary path
if (ffmpegInstaller.path) {
  ffmpeg.setFfmpegPath(ffmpegInstaller.path);
}

const UPLOAD_ROOT = path.resolve('uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const THUMBNAILS_DIR = path.join(UPLOAD_ROOT, 'thumbnails');

// Ensure working directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAILS_DIR)) fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'tiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v']);

/**
 * Download S3 object to local temporary file for processing
 */
const downloadS3ToTemp = async (bucket, key, destPath) => {
  const s3Client = getS3Client();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destPath);
    response.Body.pipe(fileStream);
    fileStream.on('finish', () => resolve(destPath));
    fileStream.on('error', reject);
  });
};

/**
 * Generate a video frame screenshot using FFmpeg
 */
const extractVideoFrame = (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('FFmpeg video frame extraction timed out (15s limit)'));
    }, 15000);

    ffmpeg(videoPath)
      .on('end', () => {
        clearTimeout(timeout);
        resolve(outputPath);
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      })
      .screenshots({
        timestamps: ['00:00:01'],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '360x?',
      });
  });
};

/**
 * Thumbnail Worker Processor
 */
export const processThumbnail = async (fileNode) => {
  if (process.env.ENABLE_THUMBNAILS === 'false') {
    return {
      thumbnailStatus: 'skipped',
      reason: 'Thumbnail generation disabled in environment',
    };
  }

  const mime = (fileNode.mimeType || '').toLowerCase();
  const ext = (fileNode.metadata?.extension || path.extname(fileNode.name || '')).replace('.', '').toLowerCase();

  const isImage = mime.startsWith('image/') || IMAGE_EXTENSIONS.has(ext);
  const isVideo = mime.startsWith('video/') || VIDEO_EXTENSIONS.has(ext);

  if (!isImage && !isVideo) {
    return {
      thumbnailStatus: 'skipped',
      reason: `Unsupported media format (${mime || ext})`,
    };
  }

  const tempFilesToClean = [];
  const fileIdStr = fileNode._id.toString();
  const userIdStr = (fileNode.ownerId || 'system').toString();

  try {
    // 1. Resolve source file path
    let localSourcePath = null;

    if (fileNode.storageProvider === 's3' && isS3Configured() && fileNode.storageKey) {
      const bucket = fileNode.s3Bucket || process.env.AWS_S3_BUCKET;
      const tempSource = path.join(TEMP_DIR, `src_${fileIdStr}_${Date.now()}.${ext || 'tmp'}`);
      tempFilesToClean.push(tempSource);

      jobLogger.info(`Downloading S3 object for thumbnail generation: ${fileNode.storageKey}`);
      await downloadS3ToTemp(bucket, fileNode.storageKey, tempSource);
      localSourcePath = tempSource;
    } else if (fileNode.storagePath && fs.existsSync(fileNode.storagePath)) {
      localSourcePath = fileNode.storagePath;
    } else {
      throw new Error(`Source file data not found on disk or storage (path: ${fileNode.storagePath})`);
    }

    // 2. Generate thumbnail WebP buffer
    let webpBuffer = null;

    if (isImage) {
      // Image processing via Sharp
      webpBuffer = await sharp(localSourcePath)
        .rotate() // Auto-orient using EXIF
        .resize({
          width: 360,
          height: 360,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    } else if (isVideo) {
      // Video poster extraction via FFmpeg
      const tempFramePath = path.join(TEMP_DIR, `frame_${fileIdStr}_${Date.now()}.png`);
      tempFilesToClean.push(tempFramePath);

      jobLogger.info(`Extracting video poster frame for ${fileNode.name}...`);
      await extractVideoFrame(localSourcePath, tempFramePath);

      if (!fs.existsSync(tempFramePath)) {
        throw new Error('Video frame extraction did not produce output image');
      }

      webpBuffer = await sharp(tempFramePath)
        .resize({
          width: 360,
          height: 360,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
    }

    if (!webpBuffer || webpBuffer.length === 0) {
      throw new Error('Generated thumbnail buffer is empty');
    }

    // 3. Save thumbnail (S3 or local)
    const thumbnailStorageKey = `thumbnails/${userIdStr}/${fileIdStr}/preview.webp`;
    let thumbnailUrl = `/api/files/${fileIdStr}/thumbnail`;

    if (isS3Configured() && fileNode.storageProvider === 's3') {
      const s3Client = getS3Client();
      const bucket = fileNode.s3Bucket || process.env.AWS_S3_BUCKET;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbnailStorageKey,
          Body: webpBuffer,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000',
        })
      );

      jobLogger.info(`Thumbnail uploaded to S3: s3://${bucket}/${thumbnailStorageKey}`);
    } else {
      // Local thumbnail storage
      const userThumbDir = path.join(THUMBNAILS_DIR, userIdStr, fileIdStr);
      if (!fs.existsSync(userThumbDir)) {
        fs.mkdirSync(userThumbDir, { recursive: true });
      }
      const localThumbPath = path.join(userThumbDir, 'preview.webp');
      fs.writeFileSync(localThumbPath, webpBuffer);
      jobLogger.info(`Thumbnail saved to local disk: ${localThumbPath}`);
    }

    return {
      thumbnailStatus: 'completed',
      thumbnailKey: thumbnailStorageKey,
      thumbnailUrl,
    };
  } catch (err) {
    jobLogger.error(`Thumbnail generation failed for ${fileIdStr}: ${err.message}`, err);
    return {
      thumbnailStatus: 'failed',
      error: err.message,
    };
  } finally {
    // 4. Guarantee cleanup of all temporary files
    for (const tempPath of tempFilesToClean) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (_e) {}
    }
  }
};

export default {
  processThumbnail,
};
