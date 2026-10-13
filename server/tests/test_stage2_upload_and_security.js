import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });

import Node from '../src/models/Node.js';
import User from '../src/models/User.js';
import Share from '../src/models/Share.js';
import { getFileNode, getFileSignedUrl } from '../src/services/nodeService.js';
import { shareByEmail, createShareLink } from '../src/services/shareService.js';
import { getFileProcessingStatus, reprocessFile } from '../src/services/jobService.js';
import { enqueueFileProcessing } from '../src/queues/fileProcessing.queue.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/cloudnest';

async function testStage2() {
  console.log('====================================================');
  console.log('   CloudNest Phase 6 - Stage 2 Integration Tests');
  console.log('====================================================\n');

  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB\n');

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

  try {
    // 1. Setup Test User and Test Files
    console.log('1. Setting up test entities:');
    await User.deleteMany({ email: 'stage2_test_user@example.com' });
    const user = await User.create({
      name: 'Stage2 Test User',
      email: 'stage2_test_user@example.com',
      password: 'Password123!',
      emailVerified: true,
    });

    const testDiskPath = path.resolve('uploads', 'sample_test.png');
    if (!fs.existsSync(path.dirname(testDiskPath))) {
      fs.mkdirSync(path.dirname(testDiskPath), { recursive: true });
    }
    fs.writeFileSync(testDiskPath, 'dummy image data');

    const fileNode = await Node.create({
      name: 'sample_test.png',
      type: 'file',
      ownerId: user._id,
      size: 2048,
      mimeType: 'image/png',
      storageProvider: 'local',
      storagePath: testDiskPath,
      processing: {
        status: 'completed',
        thumbnailStatus: 'completed',
        ocrStatus: 'completed',
        embeddingStatus: 'skipped',
      },
    });

    console.log('  Created test node with background processing metadata.');

    // Test 2: File access
    console.log('\n2. Testing File Access Services:');
    const retrieved = await getFileNode(user._id, fileNode._id);
    assert(retrieved._id.toString() === fileNode._id.toString(), 'getFileNode retrieves existing file');

    const signedUrlRes = await getFileSignedUrl(user._id, fileNode._id);
    assert(Boolean(signedUrlRes.downloadUrl), 'getFileSignedUrl generates download URL');

    // Test 3: Sharing
    console.log('\n3. Testing Share Services:');
    const shareLink = await createShareLink(user._id, { nodeId: fileNode._id });
    assert(Boolean(shareLink.token), 'createShareLink creates public share link token');

    // Test 4: Processing Status API Service
    console.log('\n4. Testing Processing Status API Service:');
    const statusData = await getFileProcessingStatus(user._id, fileNode._id);
    assert(statusData.fileId.toString() === fileNode._id.toString(), 'Returns correct fileId in status');
    assert(statusData.processingStatus === 'completed', 'Returns status completed');
    assert(statusData.thumbnail === 'completed', 'Returns thumbnailStatus completed');
    assert(statusData.ocr === 'completed', 'Returns ocrStatus completed');
    assert(statusData.embedding === 'skipped', 'Returns embeddingStatus skipped');

    // Test 5: Reprocess Action
    console.log('\n5. Testing Reprocess Action:');
    const reprocessResult = await reprocessFile(user._id, fileNode._id);
    assert(reprocessResult.success === true, 'reprocessFile returns success: true');
    assert(reprocessResult.processingStatus === 'queued', 'reprocessFile transitions status to queued');

    // Cleanup
    await User.deleteMany({ email: 'stage2_test_user@example.com' });
    await Node.deleteMany({ _id: fileNode._id });
    await Share.deleteMany({ nodeId: fileNode._id });
    if (fs.existsSync(testDiskPath)) fs.unlinkSync(testDiskPath);

    console.log('\n====================================================');
    console.log(`  Summary: ${passed}/${total} assertions passed.`);
    console.log('====================================================\n');

    if (passed === total) {
      console.log('Stage 2 verification completed successfully!\n');
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    console.error('Test execution error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

testStage2();
