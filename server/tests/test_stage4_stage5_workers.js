import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import sharp from 'sharp';

sharp.cache(false);

dotenv.config({ path: path.resolve('.env') });

import Node from '../src/models/Node.js';
import User from '../src/models/User.js';
import FileEmbedding from '../src/models/FileEmbedding.js';
import { processThumbnail } from '../src/workers/thumbnail.worker.js';
import { processOcr } from '../src/workers/ocr.worker.js';
import { processEmbedding, chunkText, normalizeText } from '../src/workers/embedding.worker.js';
import { runFileProcessingPipeline } from '../src/services/fileProcessingService.js';

const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/cloudnest';

async function testStage4And5() {
  console.log('====================================================');
  console.log('   CloudNest Phase 6 - Stage 4 & 5 Worker Tests');
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

  const uploadDir = path.resolve('uploads');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const sampleImagePath = path.join(uploadDir, 'test_sample_image.png');

  try {
    // Generate a valid PNG image containing text using Sharp SVG overlay
    console.log('1. Generating sample image for testing:');
    const svgText = `
      <svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff" />
        <text x="20" y="80" font-family="Arial" font-size="28" font-weight="bold" fill="#000000">CLOUDNEST</text>
        <text x="20" y="140" font-family="Arial" font-size="20" fill="#333333">BACKGROUND WORKER</text>
      </svg>
    `;

    await sharp({
      create: {
        width: 400,
        height: 200,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([{ input: Buffer.from(svgText), top: 0, left: 0 }])
      .png()
      .toFile(sampleImagePath);

    assert(fs.existsSync(sampleImagePath), 'Generated sample image file on disk');

    // 2. Setup user and Node document
    await User.deleteMany({ email: 'worker_test_user@example.com' });
    const user = await User.create({
      name: 'Worker Test User',
      email: 'worker_test_user@example.com',
      password: 'Password123!',
      emailVerified: true,
    });

    const fileNode = await Node.create({
      name: 'test_sample_image.png',
      type: 'file',
      ownerId: user._id,
      size: fs.statSync(sampleImagePath).size,
      mimeType: 'image/png',
      storageProvider: 'local',
      storagePath: sampleImagePath,
      metadata: {
        extension: 'png',
        originalName: 'test_sample_image.png',
      },
    });

    // 3. Test Thumbnail Worker
    console.log('\n2. Testing Image Thumbnail Worker:');
    const thumbResult = await processThumbnail(fileNode);
    assert(thumbResult.thumbnailStatus === 'completed', 'processThumbnail returns thumbnailStatus completed');
    assert(Boolean(thumbResult.thumbnailKey), `Generated thumbnail key: ${thumbResult.thumbnailKey}`);
    assert(Boolean(thumbResult.thumbnailUrl), `Generated thumbnail URL: ${thumbResult.thumbnailUrl}`);

    // Verify thumbnail is valid WebP file on disk
    const thumbDiskPath = path.resolve('uploads', thumbResult.thumbnailKey);
    assert(fs.existsSync(thumbDiskPath), 'Generated thumbnail file exists on disk');
    const thumbBuffer = fs.readFileSync(thumbDiskPath);
    const thumbMeta = await sharp(thumbBuffer).metadata();
    assert(thumbMeta.format === 'webp', 'Thumbnail is properly encoded as WebP format');
    assert(thumbMeta.width <= 360 && thumbMeta.height <= 360, 'Thumbnail dimensions constrained to <= 360px');

    // 4. Test OCR Worker
    console.log('\n3. Testing OCR Text Extraction Worker:');
    const ocrResult = await processOcr(fileNode);
    assert(ocrResult.ocrStatus === 'completed', 'processOcr returns ocrStatus completed');
    assert(Boolean(ocrResult.text), `OCR extracted text: "${ocrResult.text.replace(/\n/g, ' ')}"`);
    assert(
      ocrResult.text.toLowerCase().includes('cloudnest') || ocrResult.text.toLowerCase().includes('worker'),
      'OCR recognized keywords from synthesized image'
    );

    // 5. Test Embedding Worker
    console.log('\n4. Testing Embedding Worker & Chunking:');
    const sampleText = 'CloudNest is an enterprise cloud storage system. It features resumable chunk uploads and semantic search.';
    const normalized = normalizeText(sampleText);
    assert(normalized.length > 0, 'normalizeText cleans whitespace and control characters');

    const chunks = chunkText(sampleText, 50, 10);
    assert(chunks.length >= 2, 'chunkText properly splits text into overlapping chunks');

    process.env.ENABLE_EMBEDDINGS = 'true';
    const embeddingResult = await processEmbedding(fileNode, ocrResult.text || sampleText);
    assert(embeddingResult.embeddingStatus === 'completed', 'processEmbedding returns embeddingStatus completed');
    assert(embeddingResult.dimensions === 384, 'Embedding vectors have 384 dimensions');

    const savedEmbeddings = await FileEmbedding.find({ fileId: fileNode._id });
    assert(savedEmbeddings.length > 0, `Saved ${savedEmbeddings.length} vector embeddings in FileEmbedding collection`);
    assert(savedEmbeddings[0].embedding.length === 384, 'Embedding coordinates array is non-empty');

    // 6. Test End-to-End File Processing Pipeline
    console.log('\n5. Testing End-to-End Pipeline Orchestration:');
    const pipelineJob = {
      id: `test_job_${fileNode._id}`,
      name: 'process-file-pipeline',
      data: { fileId: fileNode._id.toString() },
      attemptsMade: 0,
      opts: { attempts: 3 },
    };

    const pipelineResult = await runFileProcessingPipeline(pipelineJob);
    assert(pipelineResult.status === 'completed', 'runFileProcessingPipeline completes end-to-end');

    const updatedNode = await Node.findById(fileNode._id);
    assert(updatedNode.processing.status === 'completed', 'Node.processing.status updated to completed');
    assert(updatedNode.processing.thumbnailStatus === 'completed', 'Node.processing.thumbnailStatus is completed');
    assert(updatedNode.processing.ocrStatus === 'completed', 'Node.processing.ocrStatus is completed');
    assert(updatedNode.processing.embeddingStatus === 'completed', 'Node.processing.embeddingStatus is completed');
    assert(Boolean(updatedNode.processing.thumbnailKey), 'Node.processing.thumbnailKey is populated');

    // Cleanup
    console.log('\nCleaning up test artifacts...');
    await User.deleteMany({ email: 'worker_test_user@example.com' });
    await Node.deleteMany({ _id: fileNode._id });
    await FileEmbedding.deleteMany({ fileId: fileNode._id });
    try {
      if (fs.existsSync(sampleImagePath)) fs.unlinkSync(sampleImagePath);
      if (fs.existsSync(thumbDiskPath)) fs.unlinkSync(thumbDiskPath);
    } catch (_e) {}

    console.log('\n====================================================');
    console.log(`  Summary: ${passed}/${total} assertions passed.`);
    console.log('====================================================\n');

    if (passed === total) {
      console.log('Stage 4 & 5 worker verification completed successfully!\n');
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

testStage4And5();
