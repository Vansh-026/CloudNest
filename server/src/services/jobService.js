import { getFileProcessingQueue, getQueueMetrics, enqueueFileProcessing } from '../queues/fileProcessing.queue.js';
import { checkRedisConnection } from '../config/redis.js';
import Node from '../models/Node.js';
import jobLogger from '../utils/jobLogger.js';

/**
 * Get comprehensive queue health and Redis status
 */
export const getSystemQueueHealth = async () => {
  const redisHealth = await checkRedisConnection();
  const queueMetrics = await getQueueMetrics();

  return {
    redis: redisHealth,
    queue: queueMetrics,
    timestamp: new Date().toISOString(),
  };
};

/**
 * Get processing status of a file from MongoDB and active queue
 */
export const getFileProcessingStatus = async (userId, fileId) => {
  const file = await Node.findOne({
    _id: fileId,
    ownerId: userId,
    type: 'file',
  });

  if (!file) {
    const error = new Error('File not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  const processing = file.processing || {
    status: 'pending',
    thumbnailStatus: 'pending',
    ocrStatus: 'pending',
    embeddingStatus: 'pending',
  };

  let queueState = null;
  if (processing.jobId) {
    const queue = getFileProcessingQueue();
    if (queue) {
      try {
        const job = await queue.getJob(processing.jobId);
        if (job) {
          queueState = await job.getState();
        }
      } catch (_e) {}
    }
  }

  return {
    fileId: file._id,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    processingStatus: processing.status,
    thumbnail: processing.thumbnailStatus,
    ocr: processing.ocrStatus,
    embedding: processing.embeddingStatus,
    thumbnailUrl: processing.thumbnailUrl || (processing.thumbnailKey ? `/api/files/${file._id}/thumbnail` : null),
    hasExtractedText: Boolean(processing.extractedText),
    lastProcessedAt: processing.lastProcessedAt,
    lastError: processing.lastError,
    queueState,
  };
};

/**
 * Trigger reprocessing of a file (e.g. after a transient failure)
 */
export const reprocessFile = async (userId, fileId) => {
  const file = await Node.findOne({
    _id: fileId,
    ownerId: userId,
    type: 'file',
    trashed: false,
  });

  if (!file) {
    const error = new Error('File not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  // Update status in MongoDB to queued
  file.processing = {
    ...file.processing,
    status: 'queued',
    thumbnailStatus: 'pending',
    ocrStatus: 'pending',
    embeddingStatus: 'pending',
    lastError: null,
  };
  await file.save();

  const enqueueResult = await enqueueFileProcessing(file, {
    fileId: file._id,
    forceReprocess: true,
  });

  if (enqueueResult.jobId) {
    file.processing.jobId = enqueueResult.jobId;
    await file.save();
  }

  return {
    success: true,
    message: 'File queued for reprocessing',
    fileId: file._id,
    jobId: enqueueResult.jobId,
    processingStatus: 'queued',
  };
};

export default {
  getSystemQueueHealth,
  getFileProcessingStatus,
  reprocessFile,
};
