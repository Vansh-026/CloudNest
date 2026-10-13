/**
 * CloudNest Background Job Logger
 * Provides structured, sanitized logging for BullMQ queues and workers.
 * Never outputs sensitive tokens, passwords, or binary file content.
 */

const formatTimestamp = () => new Date().toISOString();

const sanitizeMeta = (meta = {}) => {
  const sanitized = { ...meta };
  const sensitiveKeys = ['token', 'password', 'secret', 'authorization', 'cookie', 'key', 'apiKey', 'fileBuffer'];

  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    }
  }

  return sanitized;
};

export const jobLogger = {
  info: (message, meta = {}) => {
    const safeMeta = sanitizeMeta(meta);
    const metaStr = Object.keys(safeMeta).length > 0 ? ` ${JSON.stringify(safeMeta)}` : '';
    console.log(`[JobInfo ${formatTimestamp()}] ${message}${metaStr}`);
  },

  warn: (message, meta = {}) => {
    const safeMeta = sanitizeMeta(meta);
    const metaStr = Object.keys(safeMeta).length > 0 ? ` ${JSON.stringify(safeMeta)}` : '';
    console.warn(`[JobWarn ${formatTimestamp()}] ${message}${metaStr}`);
  },

  error: (message, error = null, meta = {}) => {
    const safeMeta = sanitizeMeta(meta);
    const errorDetails = error
      ? {
          name: error.name || 'Error',
          message: error.message || String(error),
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        }
      : {};

    const metaStr = Object.keys(safeMeta).length > 0 ? ` ${JSON.stringify(safeMeta)}` : '';
    console.error(`[JobError ${formatTimestamp()}] ${message}${metaStr}`, errorDetails);
  },

  jobStart: (job) => {
    jobLogger.info(`Job started: [${job.name}] ID: ${job.id}`, {
      jobId: job.id,
      jobName: job.name,
      fileId: job.data?.fileId,
      attempt: job.attemptsMade + 1,
    });
  },

  jobSuccess: (job, durationMs, result = null) => {
    jobLogger.info(`Job completed: [${job.name}] ID: ${job.id} in ${durationMs}ms`, {
      jobId: job.id,
      jobName: job.name,
      fileId: job.data?.fileId,
      durationMs,
      result: result ? sanitizeMeta(result) : undefined,
    });
  },

  jobFailed: (job, error, durationMs) => {
    jobLogger.error(`Job failed: [${job.name}] ID: ${job.id} in ${durationMs}ms`, error, {
      jobId: job.id,
      jobName: job.name,
      fileId: job.data?.fileId,
      durationMs,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts?.attempts,
    });
  },
};

export default jobLogger;
