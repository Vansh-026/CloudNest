import { Redis } from 'ioredis';
import jobLogger from '../utils/jobLogger.js';

let producerClient = null;
const allClients = new Set();

/**
 * Check if REDIS_URL environment variable is provided
 */
export const isRedisConfigured = () => {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '');
};

/**
 * Build connection options for ioredis
 * Distinguishes between HTTP producers and BullMQ blocking workers.
 * Fully supports Upstash Cloud Redis (rediss://) with TLS.
 */
export const getRedisOptions = ({ isWorker = false } = {}) => {
  const redisUrl = process.env.REDIS_URL;

  const baseOptions = {
    // Upstash & Cloud Redis TLS support
    tls: redisUrl && redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
    lazyConnect: true,
    showFriendlyErrorStack: process.env.NODE_ENV === 'development',
  };

  if (isWorker) {
    // BullMQ Worker requirement: maxRetriesPerRequest MUST be null
    return {
      ...baseOptions,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (times) => {
        // Linear/exponential backoff for worker reconnections
        const delay = Math.min(times * 500, 5000);
        return delay;
      },
    };
  }

  // HTTP producer connection: fast fail and retry limit
  return {
    ...baseOptions,
    maxRetriesPerRequest: 3,
    connectTimeout: 5000,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      if (times > 5) {
        jobLogger.warn('Redis producer retry count exceeded limit. Failing fast.');
        return null; // Stop retrying
      }
      return Math.min(times * 200, 2000);
    },
  };
};

/**
 * Create a new ioredis client instance.
 * Note: BullMQ Workers and QueueEvents REQUIRE dedicated connection instances
 * because workers issue blocking Redis commands.
 */
export const createRedisClient = ({ isWorker = false, name = 'redis' } = {}) => {
  if (!isRedisConfigured()) {
    jobLogger.warn(`[Redis Client: ${name}] REDIS_URL is not set. Cloud Redis connection is disabled.`);
    return null;
  }

  const redisUrl = process.env.REDIS_URL;
  const options = getRedisOptions({ isWorker });
  const client = new Redis(redisUrl, options);

  client.on('connect', () => {
    jobLogger.info(`[Redis Client: ${name}] Connected successfully to Redis.`);
  });

  client.on('ready', () => {
    jobLogger.info(`[Redis Client: ${name}] Redis client is ready to accept commands.`);
  });

  client.on('error', (err) => {
    jobLogger.error(`[Redis Client: ${name}] Redis connection error: ${err.message}`, err);
  });

  client.on('close', () => {
    jobLogger.warn(`[Redis Client: ${name}] Redis connection closed.`);
  });

  allClients.add(client);
  return client;
};

/**
 * Get or create the shared producer client for HTTP requests and adding jobs to queues
 */
export const getProducerConnection = () => {
  if (!producerClient) {
    producerClient = createRedisClient({ isWorker: false, name: 'producer' });
  }
  return producerClient;
};

/**
 * Health check to verify Redis connectivity (returns status and latency)
 */
export const checkRedisConnection = async () => {
  if (!isRedisConfigured()) {
    return {
      status: 'disabled',
      configured: false,
      message: 'REDIS_URL environment variable is not defined',
    };
  }

  const client = createRedisClient({ isWorker: false, name: 'health-check' });
  if (!client) {
    return {
      status: 'error',
      configured: false,
      message: 'Unable to initialize Redis client',
    };
  }

  const startTime = Date.now();
  try {
    await client.connect();
    const pingResponse = await client.ping();
    const latencyMs = Date.now() - startTime;

    await client.quit();
    allClients.delete(client);

    return {
      status: pingResponse === 'PONG' ? 'ok' : 'degraded',
      configured: true,
      latencyMs,
      message: 'Connected to Redis successfully',
    };
  } catch (error) {
    try {
      client.disconnect();
      allClients.delete(client);
    } catch (_e) {}

    return {
      status: 'error',
      configured: true,
      message: error.message || 'Failed to ping Redis',
    };
  }
};

/**
 * Gracefully disconnect all open Redis connections
 */
export const closeRedisConnections = async () => {
  const closePromises = [];

  for (const client of allClients) {
    if (client && client.status !== 'end') {
      closePromises.push(
        client.quit().catch(() => {
          client.disconnect();
        })
      );
    }
  }

  allClients.clear();
  producerClient = null;
  await Promise.allSettled(closePromises);
  jobLogger.info('All Redis connections closed.');
};

export default {
  isRedisConfigured,
  getRedisOptions,
  createRedisClient,
  getProducerConnection,
  checkRedisConnection,
  closeRedisConnections,
};
