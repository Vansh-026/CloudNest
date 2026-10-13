import { Queue } from 'bullmq';
import { getProducerConnection, isRedisConfigured } from '../config/redis.js';
import jobLogger from '../utils/jobLogger.js';

export const QUEUE_NAME = 'file-processing';

let fileProcessingQueue = null;

/**
 * Get or initialize BullMQ Queue instance
 */
export const getFileProcessingQueue = () => {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!fileProcessingQueue) {
    const connection = getProducerConnection();
    if (!connection) return null;

    fileProcessingQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: Number(process.env.QUEUE_MAX_ATTEMPTS || 3),
        backoff: {
          type: 'exponential',
          delay: 2000, // 2s, 4s, 8s backoff
        },
        removeOnComplete: {
          count: 500,
          age: 24 * 3600, // Keep 24 hours
        },
        removeOnFail: {
          count: 1000,
          age: 7 * 24 * 3600, // Keep 7 days for audit
        },
      },
    });

    jobLogger.info(`BullMQ Queue initialized: [${QUEUE_NAME}]`);
  }

  return fileProcessingQueue;
};

/**
 * Enqueue a file for background processing pipeline.
 * Idempotent: uses deterministic jobId `file_proc_${fileId}` unless forceReprocess is true.
 */
export const enqueueFileProcessing = async (fileData, options = {}) => {
  const { fileId, forceReprocess = false } = options;
  const queue = getFileProcessingQueue();

  if (!queue) {
    jobLogger.warn(`Cannot enqueue file ${fileId || fileData._id}: Redis is not configured.`);
    return {
      queued: false,
      jobId: null,
      reason: 'REDIS_NOT_CONFIGURED',
      message: 'Redis queue is not currently configured or available',
    };
  }

  const targetFileId = (fileId || fileData._id || fileData.fileId).toString();
  // Deterministic Job ID ensures idempotency and prevents duplicate jobs
  const jobId = forceReprocess
    ? `file_proc_${targetFileId}_${Date.now()}`
    : `file_proc_${targetFileId}`;

  try {
    // Check if an existing active/waiting job with this ID already exists
    if (!forceReprocess) {
      const existingJob = await queue.getJob(jobId);
      if (existingJob) {
        const state = await existingJob.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          jobLogger.info(`Job ${jobId} already exists in state [${state}]. Skipping duplicate enqueue.`);
          return {
            queued: true,
            jobId: existingJob.id,
            state,
            message: `Processing is already ${state}`,
          };
        }
      }
    }

    const payload = {
      fileId: targetFileId,
      userId: fileData.ownerId?.toString() || fileData.userId?.toString(),
      name: fileData.name || fileData.filename,
      mimeType: fileData.mimeType || fileData.mimetype,
      size: fileData.size,
      storageProvider: fileData.storageProvider || 'local',
      storageKey: fileData.storageKey || null,
      storagePath: fileData.storagePath || null,
      s3Bucket: fileData.s3Bucket || null,
      enqueuedAt: new Date().toISOString(),
    };

    const job = await queue.add('process-file-pipeline', payload, {
      jobId,
    });

    jobLogger.info(`Enqueued processing pipeline for file ${targetFileId} with job ID ${job.id}`);

    return {
      queued: true,
      jobId: job.id,
      message: 'Job enqueued successfully',
    };
  } catch (error) {
    jobLogger.error(`Failed to enqueue file ${targetFileId}: ${error.message}`, error);
    return {
      queued: false,
      jobId: null,
      reason: 'ENQUEUE_ERROR',
      error: error.message,
    };
  }
};

/**
 * Get queue metrics for monitoring and health checks
 */
export const getQueueMetrics = async () => {
  const queue = getFileProcessingQueue();
  if (!queue) {
    return {
      available: false,
      message: 'Queue unavailable (Redis not configured)',
    };
  }

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      available: true,
      queueName: QUEUE_NAME,
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + delayed,
      },
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
    };
  }
};

export default {
  QUEUE_NAME,
  getFileProcessingQueue,
  enqueueFileProcessing,
  getQueueMetrics,
};
