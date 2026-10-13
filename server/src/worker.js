import 'dotenv/config';
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import connectDB from './config/db.js';
import { createRedisClient, closeRedisConnections, isRedisConfigured } from './config/redis.js';
import { QUEUE_NAME } from './queues/fileProcessing.queue.js';
import { initQueueEvents, closeQueueEvents } from './queues/queueEvents.js';
import { runFileProcessingPipeline } from './services/fileProcessingService.js';
import jobLogger from './utils/jobLogger.js';

let worker = null;
let isShuttingDown = false;

const startWorker = async () => {
  try {
    jobLogger.info('Starting CloudNest Background Worker service...');

    // 1. Connect to MongoDB Atlas
    await connectDB();
    jobLogger.info('Connected to MongoDB database.');

    // 2. Validate Redis connectivity
    if (!isRedisConfigured()) {
      jobLogger.error('FATAL: REDIS_URL is not configured in environment. Worker cannot start without Redis.');
      jobLogger.warn('Please set REDIS_URL (e.g. Upstash Cloud Redis rediss://...) in server/.env');
      process.exit(1);
    }

    // 3. Create dedicated Redis connection for Worker (requires maxRetriesPerRequest: null)
    const workerConnection = createRedisClient({
      isWorker: true,
      name: 'worker-engine',
    });

    if (!workerConnection) {
      jobLogger.error('Failed to create worker Redis connection.');
      process.exit(1);
    }

    const concurrency = Math.max(1, parseInt(process.env.WORKER_CONCURRENCY || '2', 10));

    // 4. Initialize BullMQ Worker
    worker = new Worker(
      QUEUE_NAME,
      async (job) => {
        return await runFileProcessingPipeline(job);
      },
      {
        connection: workerConnection,
        concurrency,
        limiter: {
          max: 10,
          duration: 1000, // Max 10 jobs per second rate limit
        },
      }
    );

    // 5. Worker lifecycle events
    worker.on('ready', () => {
      jobLogger.info(`CloudNest Worker ready and listening on queue [${QUEUE_NAME}] (Concurrency: ${concurrency})`);
    });

    worker.on('active', (job) => {
      jobLogger.info(`Job [${job.name}] with ID ${job.id} is now active.`);
    });

    worker.on('completed', (job, result) => {
      jobLogger.info(`Job [${job.name}] with ID ${job.id} completed successfully.`);
    });

    worker.on('failed', (job, err) => {
      jobLogger.error(`Job [${job?.name || 'unknown'}] with ID ${job?.id} failed: ${err.message}`, err);
    });

    worker.on('error', (err) => {
      jobLogger.error(`BullMQ Worker encountered an error: ${err.message}`, err);
    });

    // 6. Initialize QueueEvents listener
    initQueueEvents();

    // 7. Graceful Shutdown Handlers
    const handleShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      jobLogger.info(`\n[Worker] Received ${signal}. Commencing graceful worker shutdown...`);

      try {
        if (worker) {
          jobLogger.info('[Worker] Pausing worker and waiting for active jobs to finish...');
          await worker.close();
          jobLogger.info('[Worker] BullMQ Worker closed.');
        }

        await closeQueueEvents();
        await closeRedisConnections();

        if (mongoose.connection.readyState === 1) {
          await mongoose.disconnect();
          jobLogger.info('[Worker] MongoDB disconnected.');
        }

        jobLogger.info('[Worker] Clean shutdown complete.');
        process.exit(0);
      } catch (err) {
        jobLogger.error(`[Worker] Error during shutdown: ${err.message}`, err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));

    process.on('unhandledRejection', (reason) => {
      jobLogger.error('Unhandled Promise Rejection in worker process', reason);
    });

    process.on('uncaughtException', (err) => {
      jobLogger.error('Uncaught Exception in worker process', err);
      handleShutdown('UNCAUGHT_EXCEPTION');
    });
  } catch (startupError) {
    jobLogger.error(`Fatal error during worker startup: ${startupError.message}`, startupError);
    process.exit(1);
  }
};

startWorker();
