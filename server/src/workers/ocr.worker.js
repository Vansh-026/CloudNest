import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, isS3Configured } from '../services/s3Service.js';
import jobLogger from '../utils/jobLogger.js';

const UPLOAD_ROOT = path.resolve('uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const OCR_SUPPORTED_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff']);
const OCR_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB max for OCR memory safety

/**
 * Download S3 object to local temporary file
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
 * OCR Text Extraction Worker
 */
export const processOcr = async (fileNode) => {
  if (process.env.ENABLE_OCR === 'false') {
    return {
      ocrStatus: 'skipped',
      reason: 'OCR disabled in environment',
    };
  }

  const mime = (fileNode.mimeType || '').toLowerCase();
  const ext = (fileNode.metadata?.extension || path.extname(fileNode.name || '')).replace('.', '').toLowerCase();

  const isEligibleImage = mime.startsWith('image/') || OCR_SUPPORTED_EXTS.has(ext);

  if (!isEligibleImage) {
    return {
      ocrStatus: 'skipped',
      reason: `File format ${mime || ext} is not eligible for OCR text extraction`,
    };
  }

  // Size guard
  if (fileNode.size && fileNode.size > OCR_MAX_SIZE_BYTES) {
    jobLogger.warn(`Skipping OCR for ${fileNode._id}: file size (${fileNode.size} bytes) exceeds 20MB limit.`);
    return {
      ocrStatus: 'skipped',
      reason: 'File size exceeds maximum OCR processing limit (20MB)',
    };
  }

  const tempFilesToClean = [];
  const fileIdStr = fileNode._id.toString();
  let tesseractWorker = null;

  try {
    // 1. Resolve source path
    let localSourcePath = null;

    if (fileNode.storageProvider === 's3' && isS3Configured() && fileNode.storageKey) {
      const bucket = fileNode.s3Bucket || process.env.AWS_S3_BUCKET;
      const tempSource = path.join(TEMP_DIR, `ocr_${fileIdStr}_${Date.now()}.${ext || 'png'}`);
      tempFilesToClean.push(tempSource);

      jobLogger.info(`Downloading S3 object for OCR extraction: ${fileNode.storageKey}`);
      await downloadS3ToTemp(bucket, fileNode.storageKey, tempSource);
      localSourcePath = tempSource;
    } else if (fileNode.storagePath && fs.existsSync(fileNode.storagePath)) {
      localSourcePath = fileNode.storagePath;
    } else {
      return {
        ocrStatus: 'skipped',
        reason: 'Source file not available for OCR',
      };
    }

    jobLogger.info(`Running Tesseract OCR on ${fileNode.name}...`);

    // 2. Initialize Tesseract worker with timeout
    tesseractWorker = await createWorker('eng');

    const recognitionPromise = tesseractWorker.recognize(localSourcePath);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Tesseract OCR extraction timed out (30s limit)')), 30000);
    });

    const result = await Promise.race([recognitionPromise, timeoutPromise]);
    const extractedText = (result.data?.text || '').trim();

    jobLogger.info(`OCR extraction completed for ${fileIdStr}: ${extractedText.length} characters extracted.`);

    return {
      ocrStatus: 'completed',
      text: extractedText.length > 0 ? extractedText : null,
      confidence: result.data?.confidence,
    };
  } catch (err) {
    jobLogger.error(`OCR processing failed on ${fileIdStr}: ${err.message}`, err);
    return {
      ocrStatus: 'failed',
      error: err.message,
    };
  } finally {
    // 3. Terminate Tesseract worker
    if (tesseractWorker) {
      try {
        await tesseractWorker.terminate();
      } catch (_e) {}
    }

    // 4. Clean up temporary files
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
  processOcr,
};
