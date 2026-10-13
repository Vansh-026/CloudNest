import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });

import Node from '../src/models/Node.js';
import { isRedisConfigured, checkRedisConnection } from '../src/config/redis.js';
import { enqueueFileProcessing, getQueueMetrics } from '../src/queues/fileProcessing.queue.js';
import { getSystemQueueHealth } from '../src/services/jobService.js';
import { runFileProcessingPipeline } from '../src/services/fileProcessingService.js';

async function testStage1() {
  console.log('====================================================');
  console.log('   CloudNest Phase 6 - Stage 1 Foundation Tests');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  const assert = (condition, name) => {
    total++;
    if (condition) {
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${name}`);
    }
  };

  // Test 1: Node schema has processing fields
  console.log('1. Validating Node.js Mongoose Schema:');
  const testNode = new Node({
    name: 'test-foundation.png',
    type: 'file',
    ownerId: new mongoose.Types.ObjectId(),
    mimeType: 'image/png',
    size: 1024,
  });

  assert(testNode.processing !== undefined, 'Node model has processing sub-document');
  assert(testNode.processing.status === 'pending', 'Default processing.status is "pending"');
  assert(testNode.processing.thumbnailStatus === 'pending', 'Default processing.thumbnailStatus is "pending"');
  assert(testNode.processing.ocrStatus === 'pending', 'Default processing.ocrStatus is "pending"');
  assert(testNode.processing.embeddingStatus === 'pending', 'Default processing.embeddingStatus is "pending"');

  // Test 2: Redis Configuration check
  console.log('\n2. Testing Redis Configuration & Connection:');
  const redisConfigured = isRedisConfigured();
  console.log(`  Info: isRedisConfigured() = ${redisConfigured}`);
  
  const redisHealth = await checkRedisConnection();
  console.log(`  Info: checkRedisConnection() status = "${redisHealth.status}", message = "${redisHealth.message}"`);
  
  if (!redisConfigured) {
    assert(redisHealth.configured === false, 'Redis reports configured: false when REDIS_URL is not set');
  } else {
    assert(redisHealth.configured === true, 'Redis reports configured: true when REDIS_URL is set');
    assert(redisHealth.status === 'ok', `Redis ping successful (latency: ${redisHealth.latencyMs}ms)`);
  }

  // Test 3: Safe enqueue behavior
  console.log('\n3. Testing Enqueue Behavior:');
  const enqueueResult = await enqueueFileProcessing(testNode);
  if (!redisConfigured) {
    assert(enqueueResult.queued === false, 'Enqueue safely reports queued: false when Redis is offline/unset');
    assert(enqueueResult.reason === 'REDIS_NOT_CONFIGURED', 'Enqueue reason is REDIS_NOT_CONFIGURED');
  } else {
    assert(enqueueResult.queued === true, 'Job successfully queued in BullMQ');
    assert(Boolean(enqueueResult.jobId), `Job created with ID: ${enqueueResult.jobId}`);
  }

  // Test 4: Queue Health Service
  console.log('\n4. Testing System Queue Health Service:');
  const systemHealth = await getSystemQueueHealth();
  assert(systemHealth.redis !== undefined, 'Health check returns redis status');
  assert(systemHealth.queue !== undefined, 'Health check returns queue metrics');

  console.log('\n====================================================');
  console.log(`  Summary: ${passed}/${total} assertions passed.`);
  console.log('====================================================\n');

  if (passed === total) {
    console.log('Stage 1 foundation verification completed successfully!\n');
    process.exit(0);
  } else {
    console.error('Stage 1 verification had failures.');
    process.exit(1);
  }
}

testStage1().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
