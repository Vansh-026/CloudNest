import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import Chunk from '../models/Chunk.js';
import UploadSession from '../models/UploadSession.js';
import Node from '../models/Node.js';
import User from '../models/User.js';
import { uploadFileToStorage, isS3Configured } from './s3Service.js';

const UPLOAD_ROOT = path.resolve('uploads');
const CHUNKS_DIR = path.join(UPLOAD_ROOT, 'chunks');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const MIME_MAP = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  webm: 'video/webm',
  avi: 'video/x-msvideo',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  rar: 'application/x-rar-compressed',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  js: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  html: 'text/html',
  css: 'text/css',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const getMimeType = (filename) => {
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
};

/**
 * Initialize chunk upload session with chunk hashes for deduplication
 */
export const initUploadSession = async (userId, {
  filename,
  size,
  chunkSize = 5 * 1024 * 1024,
  chunkHashes = [],
  parentId: rawParentId,
}) => {
  if (!filename || !size || !Array.isArray(chunkHashes) || chunkHashes.length === 0) {
    const error = new Error('Invalid upload parameters: filename, size, and chunkHashes required');
    error.statusCode = 400;
    throw error;
  }

  const parentId =
    !rawParentId || rawParentId === 'root' || rawParentId === 'null'
      ? null
      : new mongoose.Types.ObjectId(rawParentId);

  if (parentId) {
    const parentFolder = await Node.findOne({
      _id: parentId,
      type: 'folder',
      trashed: false,
    });

    if (!parentFolder) {
      const error = new Error('Parent folder not found or trashed');
      error.statusCode = 404;
      throw error;
    }
  }

  // Check user storage limit
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const currentUsed = user.storageUsed || 0;
  const limit = user.storageLimit || 10 * 1024 * 1024 * 1024;
  if (currentUsed + size > limit) {
    const error = new Error('Storage quota exceeded');
    error.statusCode = 413;
    throw error;
  }

  // Deduplication check: check which chunk hashes already exist on server
  const completedChunks = [];
  const missingChunks = [];

  // Query all chunks matching the provided hashes
  const existingChunks = await Chunk.find({ hash: { $in: chunkHashes } });
  const existingMap = new Map();
  for (const chunk of existingChunks) {
    if (fs.existsSync(chunk.storagePath)) {
      existingMap.set(chunk.hash, chunk);
    }
  }

  // Match each index
  chunkHashes.forEach((hash, index) => {
    const cleanHash = hash.toLowerCase().trim();
    if (existingMap.has(cleanHash)) {
      completedChunks.push(index);
    } else {
      missingChunks.push(index);
    }
  });

  const uploadId = `upl_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

  const session = await UploadSession.create({
    uploadId,
    userId,
    parentId,
    filename: filename.trim(),
    size,
    chunkSize,
    totalChunks: chunkHashes.length,
    chunkHashes: chunkHashes.map((h) => h.toLowerCase().trim()),
    completedChunks,
    status: 'uploading',
  });

  // If 100% deduplicated, we can automatically assemble and complete!
  let completedFile = null;
  if (missingChunks.length === 0) {
    completedFile = await assembleAndFinalizeUpload(session);
  }

  return {
    uploadId: session.uploadId,
    filename: session.filename,
    size: session.size,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    completedChunks: session.completedChunks,
    missingChunks,
    isComplete: missingChunks.length === 0,
    file: completedFile,
  };
};

/**
 * Handle incoming chunk upload
 */
export const saveChunk = async (userId, uploadId, { chunkIndex, hash, chunkBuffer }) => {
  const session = await UploadSession.findOne({ uploadId, userId });
  if (!session) {
    const error = new Error('Upload session not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  if (session.status === 'cancelled') {
    const error = new Error('Upload session has been cancelled');
    error.statusCode = 400;
    throw error;
  }

  const idx = parseInt(chunkIndex, 10);
  if (isNaN(idx) || idx < 0 || idx >= session.totalChunks) {
    const error = new Error(`Invalid chunk index ${chunkIndex}`);
    error.statusCode = 400;
    throw error;
  }

  const expectedHash = session.chunkHashes[idx];
  const receivedHash = (hash || '').toLowerCase().trim();

  // Verify hash
  const computedHash = crypto.createHash('sha256').update(chunkBuffer).digest('hex').toLowerCase();

  if (computedHash !== expectedHash || (receivedHash && computedHash !== receivedHash)) {
    const error = new Error(`Chunk SHA-256 integrity mismatch. Expected: ${expectedHash}, computed: ${computedHash}`);
    error.statusCode = 400;
    throw error;
  }

  // Store chunk in chunks pool for deduplication
  const chunkStoragePath = path.join(CHUNKS_DIR, computedHash);
  if (!fs.existsSync(chunkStoragePath)) {
    fs.writeFileSync(chunkStoragePath, chunkBuffer);
  }

  await Chunk.findOneAndUpdate(
    { hash: computedHash },
    {
      hash: computedHash,
      size: chunkBuffer.length,
      storagePath: chunkStoragePath,
      $inc: { refCount: 1 },
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Mark chunk completed in session
  if (!session.completedChunks.includes(idx)) {
    session.completedChunks.push(idx);
    session.completedChunks.sort((a, b) => a - b);
    await session.save();
  }

  const isComplete = session.completedChunks.length === session.totalChunks;

  return {
    uploadId: session.uploadId,
    chunkIndex: idx,
    completedChunks: session.completedChunks,
    totalChunks: session.totalChunks,
    isComplete,
  };
};

/**
 * Get status of an ongoing upload session (for resume/pause)
 */
export const getUploadSessionStatus = async (userId, uploadId) => {
  const session = await UploadSession.findOne({ uploadId, userId });
  if (!session) {
    const error = new Error('Upload session not found');
    error.statusCode = 404;
    throw error;
  }

  const missingChunks = [];
  for (let i = 0; i < session.totalChunks; i++) {
    if (!session.completedChunks.includes(i)) {
      missingChunks.push(i);
    }
  }

  return {
    uploadId: session.uploadId,
    filename: session.filename,
    size: session.size,
    chunkSize: session.chunkSize,
    totalChunks: session.totalChunks,
    completedChunks: session.completedChunks,
    missingChunks,
    status: session.status,
    isComplete: missingChunks.length === 0,
    fileNodeId: session.fileNodeId,
  };
};

/**
 * Finalize upload by assembling all chunks into final file
 */
export const assembleAndFinalizeUpload = async (session) => {
  if (session.status === 'completed' && session.fileNodeId) {
    const existing = await Node.findById(session.fileNodeId);
    if (existing) return existing;
  }

  // Verify all chunks exist
  if (session.completedChunks.length !== session.totalChunks) {
    const missing = [];
    for (let i = 0; i < session.totalChunks; i++) {
      if (!session.completedChunks.includes(i)) missing.push(i);
    }
    const error = new Error(`Cannot assemble file: missing chunks [${missing.join(', ')}]`);
    error.statusCode = 400;
    throw error;
  }

  // Prepare destination user directory
  const userIdStr = session.userId.toString();
  const userDir = path.join(UPLOAD_ROOT, `u_${userIdStr}`);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const sanitizedOriginal = path.basename(session.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  const finalFilename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitizedOriginal}`;
  const finalFilePath = path.join(userDir, finalFilename);

  const fileWriteStream = fs.createWriteStream(finalFilePath);
  const fullChecksumHash = crypto.createHash('sha256');

  // Stream each chunk in order
  for (let i = 0; i < session.totalChunks; i++) {
    const chunkHash = session.chunkHashes[i];
    const chunkPath = path.join(CHUNKS_DIR, chunkHash);

    if (!fs.existsSync(chunkPath)) {
      fileWriteStream.destroy();
      if (fs.existsSync(finalFilePath)) fs.unlinkSync(finalFilePath);
      const error = new Error(`Missing chunk data on disk for chunk index ${i} (${chunkHash})`);
      error.statusCode = 500;
      throw error;
    }

    const chunkData = fs.readFileSync(chunkPath);
    fullChecksumHash.update(chunkData);
    fileWriteStream.write(chunkData);
  }

  await new Promise((resolve, reject) => {
    fileWriteStream.end((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const fullChecksum = fullChecksumHash.digest('hex');
  const ext = path.extname(session.filename).toLowerCase();
  const mimeType = getMimeType(session.filename);

  // Upload to S3 if configured, or keep local
  const tempFileObj = {
    originalname: session.filename,
    path: finalFilePath,
    size: session.size,
    mimetype: mimeType,
  };

  const storageResult = await uploadFileToStorage({
    file: tempFileObj,
    userId: session.userId,
  });

  // Create Node document
  const fileNode = await Node.create({
    name: session.filename,
    type: 'file',
    ownerId: session.userId,
    parentId: session.parentId,
    size: session.size,
    mimeType,
    storageProvider: storageResult.storageProvider,
    storageKey: storageResult.storageKey,
    s3Bucket: storageResult.s3Bucket,
    storagePath: storageResult.storagePath,
    metadata: {
      extension: ext,
      originalName: session.filename,
      checksum: fullChecksum,
    },
  });

  // Update user storage
  await User.findByIdAndUpdate(session.userId, {
    $inc: { storageUsed: session.size },
  });

  // Mark session completed
  session.status = 'completed';
  session.fileNodeId = fileNode._id;
  await session.save();

  return fileNode;
};

/**
 * Complete upload endpoint handler
 */
export const completeUploadSession = async (userId, uploadId) => {
  const session = await UploadSession.findOne({ uploadId, userId });
  if (!session) {
    const error = new Error('Upload session not found');
    error.statusCode = 404;
    throw error;
  }

  const fileNode = await assembleAndFinalizeUpload(session);
  return fileNode;
};

/**
 * Cancel upload session
 */
export const cancelUploadSession = async (userId, uploadId) => {
  const session = await UploadSession.findOne({ uploadId, userId });
  if (!session) {
    const error = new Error('Upload session not found');
    error.statusCode = 404;
    throw error;
  }

  session.status = 'cancelled';
  await session.save();

  return { success: true, message: 'Upload session cancelled' };
};
