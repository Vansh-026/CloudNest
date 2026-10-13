import { QueueEvents } from 'bullmq';
import { createRedisClient, isRedisConfigured } from '../config/redis.js';
import { QUEUE_NAME } from './fileProcessing.queue.js';
import jobLogger from '../utils/jobLogger.js';

let queueEventsInstance = null;

export const initQueueEvents = () => {
  if (!isRedisConfigured()) {
    return null;
  }

  if (!queueEventsInstance) {
    const connection = createRedisClient({ isWorker: true, name: 'queue-events' });
    if (!connection) return null;

    queueEventsInstance = new QueueEvents(QUEUE_NAME, { connection });

    queueEventsInstance.on('completed', ({ jobId, returnvalue }) => {
      jobLogger.info(`[QueueEvent: ${QUEUE_NAME}] Job ${jobId} completed`, { jobId, returnvalue });
    });

    queueEventsInstance.on('failed', ({ jobId, failedReason }) => {
      jobLogger.error(`[QueueEvent: ${QUEUE_NAME}] Job ${jobId} failed: ${failedReason}`, null, {
        jobId,
        failedReason,
      });
    });

    queueEventsInstance.on('progress', ({ jobId, data }) => {
      jobLogger.info(`[QueueEvent: ${QUEUE_NAME}] Job ${jobId} progress: ${JSON.stringify(data)}`);
    });

    queueEventsInstance.on('error', (err) => {
      jobLogger.error(`[QueueEvent: ${QUEUE_NAME}] Error: ${err.message}`, err);
    });

    jobLogger.info(`QueueEvents initialized for [${QUEUE_NAME}]`);
  }

  return queueEventsInstance;
};

export const closeQueueEvents = async () => {
  if (queueEventsInstance) {
    await queueEventsInstance.close();
    queueEventsInstance = null;
    jobLogger.info(`QueueEvents closed for [${QUEUE_NAME}]`);
  }
};

export default {
  initQueueEvents,
  closeQueueEvents,
};
