import Node from '../models/Node.js';
import jobLogger from '../utils/jobLogger.js';
import { processThumbnail } from '../workers/thumbnail.worker.js';
import { processOcr } from '../workers/ocr.worker.js';
import { processEmbedding } from '../workers/embedding.worker.js';

/**
 * Background Job Pipeline Orchestrator:
 *   1. Thumbnail Generation (images via Sharp, videos via FFmpeg)
 *   2. OCR Text Extraction (Tesseract.js)
 *   3. Semantic Embeddings (pluggable vector provider using extracted text)
 */
export const runFileProcessingPipeline = async (job) => {
  const { fileId } = job.data;
  const startTime = Date.now();

  jobLogger.jobStart(job);

  const fileNode = await Node.findById(fileId);
  if (!fileNode) {
    jobLogger.warn(`File ${fileId} not found in MongoDB. Terminating processing job.`);
    return { skipped: true, reason: 'File document not found' };
  }

  // Update status in MongoDB to processing
  fileNode.processing = {
    ...fileNode.processing,
    status: 'processing',
    jobId: job.id,
    lastError: null,
  };
  await fileNode.save();

  try {
    // -------------------------------------------------------------
    // STAGE 1: Thumbnail Generation (Images & Videos)
    // -------------------------------------------------------------
    try {
      fileNode.processing.thumbnailStatus = 'processing';
      await fileNode.save();

      const thumbResult = await processThumbnail(fileNode);
      fileNode.processing.thumbnailStatus = thumbResult.thumbnailStatus || 'completed';
      if (thumbResult.thumbnailKey) {
        fileNode.processing.thumbnailKey = thumbResult.thumbnailKey;
      }
      if (thumbResult.thumbnailUrl) {
        fileNode.processing.thumbnailUrl = thumbResult.thumbnailUrl;
      }
    } catch (thumbErr) {
      jobLogger.error(`Thumbnail generation error on ${fileId}: ${thumbErr.message}`, thumbErr);
      fileNode.processing.thumbnailStatus = 'failed';
    }

    // -------------------------------------------------------------
    // STAGE 2: OCR Text Extraction
    // -------------------------------------------------------------
    let extractedText = null;
    try {
      fileNode.processing.ocrStatus = 'processing';
      await fileNode.save();

      const ocrResult = await processOcr(fileNode);
      fileNode.processing.ocrStatus = ocrResult.ocrStatus || 'completed';
      if (ocrResult.text) {
        extractedText = ocrResult.text;
        fileNode.processing.extractedText = extractedText;
      }
    } catch (ocrErr) {
      jobLogger.error(`OCR extraction error on ${fileId}: ${ocrErr.message}`, ocrErr);
      fileNode.processing.ocrStatus = 'failed';
    }

    // -------------------------------------------------------------
    // STAGE 3: Semantic Embeddings (Dependent on extracted text)
    // -------------------------------------------------------------
    try {
      const embeddingResult = await processEmbedding(fileNode, extractedText);
      fileNode.processing.embeddingStatus = embeddingResult.embeddingStatus || 'completed';
    } catch (embedErr) {
      jobLogger.error(`Embedding generation error on ${fileId}: ${embedErr.message}`, embedErr);
      fileNode.processing.embeddingStatus = 'failed';
    }

    // Finalize pipeline status
    fileNode.processing.status = 'completed';
    fileNode.processing.lastProcessedAt = new Date();
    await fileNode.save();

    const durationMs = Date.now() - startTime;
    jobLogger.jobSuccess(job, durationMs, {
      fileId,
      thumbnail: fileNode.processing.thumbnailStatus,
      ocr: fileNode.processing.ocrStatus,
      embedding: fileNode.processing.embeddingStatus,
    });

    return {
      fileId,
      status: 'completed',
      durationMs,
    };
  } catch (pipelineError) {
    const durationMs = Date.now() - startTime;
    jobLogger.jobFailed(job, pipelineError, durationMs);

    fileNode.processing.status = 'failed';
    fileNode.processing.lastError = pipelineError.message;
    fileNode.processing.lastProcessedAt = new Date();
    await fileNode.save();

    throw pipelineError; // Allow BullMQ exponential retries
  }
};

export default {
  runFileProcessingPipeline,
};
