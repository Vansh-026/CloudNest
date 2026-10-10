import { api } from '../services/api';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB per chunk as specified

/**
 * Compute SHA-256 hash of a Blob / ArrayBuffer using browser native Web Crypto API
 */
export const computeChunkHash = async (blob) => {
  const arrayBuffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Generates an ASCII visual progress bar:
 * e.g. "████████████░░░░░░░░ 60%"
 */
export const getAsciiProgressBar = (percent = 0, length = 20) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filledCount = Math.round((clamped / 100) * length);
  const emptyCount = Math.max(0, length - filledCount);
  const filled = '█'.repeat(filledCount);
  const empty = '░'.repeat(emptyCount);
  return `${filled}${empty} ${clamped}%`;
};

/**
 * Resumable Chunk Upload Task Controller
 */
export class ChunkUploadTask {
  constructor(file, parentId, options = {}) {
    this.file = file;
    this.parentId = parentId || null;
    this.chunkSize = options.chunkSize || CHUNK_SIZE;
    this.totalChunks = Math.ceil(file.size / this.chunkSize) || 1;
    this.uploadId = null;
    this.chunkHashes = [];
    this.completedChunks = new Set();
    this.status = 'idle'; // 'idle' | 'hashing' | 'uploading' | 'paused' | 'completed' | 'cancelled' | 'error'
    this.error = null;
    this.deduplicatedCount = 0;
    this.currentAbortController = null;
    this.onProgress = options.onProgress || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
  }

  updateStatus(status, extra = {}) {
    this.status = status;
    this.onStatusChange({
      status,
      percent: this.getProgressPercent(),
      completedChunks: Array.from(this.completedChunks),
      totalChunks: this.totalChunks,
      deduplicatedCount: this.deduplicatedCount,
      ...extra,
    });
  }

  getProgressPercent() {
    if (this.totalChunks === 0) return 0;
    return Math.min(100, Math.round((this.completedChunks.size / this.totalChunks) * 100));
  }

  notifyProgress() {
    this.onProgress({
      uploadId: this.uploadId,
      filename: this.file.name,
      size: this.file.size,
      percent: this.getProgressPercent(),
      asciiBar: getAsciiProgressBar(this.getProgressPercent()),
      completedCount: this.completedChunks.size,
      totalChunks: this.totalChunks,
      status: this.status,
      deduplicatedCount: this.deduplicatedCount,
    });
  }

  async start() {
    try {
      this.updateStatus('hashing');

      // 1. Divide file into chunks and calculate SHA-256 for each chunk
      this.chunkHashes = [];
      for (let i = 0; i < this.totalChunks; i++) {
        if (this.status === 'cancelled') return;
        const start = i * this.chunkSize;
        const end = Math.min(this.file.size, start + this.chunkSize);
        const chunkBlob = this.file.slice(start, end);
        const hash = await computeChunkHash(chunkBlob);
        this.chunkHashes.push(hash);
      }

      if (this.status === 'cancelled') return;

      // 2. Initialize upload session: POST /uploads/init
      const initRes = await api.initChunkUpload({
        filename: this.file.name,
        size: this.file.size,
        chunkSize: this.chunkSize,
        chunkHashes: this.chunkHashes,
        parentId: this.parentId,
      });

      if (!initRes.success) {
        throw new Error(initRes.message || 'Failed to initialize chunk upload');
      }

      const { uploadId, completedChunks, missingChunks, isComplete, file } = initRes.data;
      this.uploadId = uploadId;

      // Server deduplication check: existing chunks are already completed
      completedChunks.forEach((idx) => this.completedChunks.add(idx));
      this.deduplicatedCount = this.completedChunks.size;

      // If all chunks already existed on server, deduplication is 100%!
      if (isComplete) {
        this.updateStatus('completed', { file });
        this.notifyProgress();
        this.onComplete(file);
        return file;
      }

      this.updateStatus('uploading');
      this.notifyProgress();

      // 3. Upload missing chunks sequentially (resumable)
      return await this.uploadRemainingChunks(missingChunks);
    } catch (err) {
      if (this.status !== 'paused' && this.status !== 'cancelled') {
        this.error = err.message;
        this.updateStatus('error', { error: err.message });
        this.onError(err);
      }
    }
  }

  async uploadRemainingChunks(missingIndices) {
    for (const idx of missingIndices) {
      if (this.status === 'paused' || this.status === 'cancelled') {
        return;
      }

      if (this.completedChunks.has(idx)) {
        continue;
      }

      const start = idx * this.chunkSize;
      const end = Math.min(this.file.size, start + this.chunkSize);
      const chunkBlob = this.file.slice(start, end);
      const hash = this.chunkHashes[idx];

      this.currentAbortController = new AbortController();

      try {
        const chunkRes = await api.uploadChunk(
          this.uploadId,
          idx,
          hash,
          chunkBlob,
          this.currentAbortController.signal
        );

        if (!chunkRes.success) {
          throw new Error(chunkRes.message || `Chunk ${idx} upload failed`);
        }

        this.completedChunks.add(idx);
        this.notifyProgress();
      } catch (err) {
        if (err.name === 'AbortError') {
          return; // Paused or cancelled cleanly
        }
        throw err;
      } finally {
        this.currentAbortController = null;
      }
    }

    if (this.completedChunks.size === this.totalChunks) {
      // 4. Finalize assembled file
      const completeRes = await api.completeChunkUpload(this.uploadId);
      if (!completeRes.success) {
        throw new Error(completeRes.message || 'Failed to complete upload');
      }

      const finalFile = completeRes.data?.file;
      this.updateStatus('completed', { file: finalFile });
      this.notifyProgress();
      this.onComplete(finalFile);
      return finalFile;
    }
  }

  /**
   * Pause upload
   */
  pause() {
    if (this.status === 'uploading' || this.status === 'hashing') {
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }
      this.updateStatus('paused');
      this.notifyProgress();
    }
  }

  /**
   * Resume upload (re-fetches missing chunks and continues)
   */
  async resume() {
    if (this.status === 'paused') {
      this.updateStatus('uploading');
      this.notifyProgress();

      try {
        let missingIndices = [];
        if (this.uploadId) {
          // Re-sync with server status to handle network reconnects
          const statusRes = await api.getUploadStatus(this.uploadId);
          if (statusRes.success && statusRes.data) {
            statusRes.data.completedChunks.forEach((i) => this.completedChunks.add(i));
            missingIndices = statusRes.data.missingChunks;
          }
        }

        if (missingIndices.length === 0) {
          for (let i = 0; i < this.totalChunks; i++) {
            if (!this.completedChunks.has(i)) missingIndices.push(i);
          }
        }

        await this.uploadRemainingChunks(missingIndices);
      } catch (err) {
        if (this.status !== 'paused' && this.status !== 'cancelled') {
          this.error = err.message;
          this.updateStatus('error', { error: err.message });
          this.onError(err);
        }
      }
    }
  }

  /**
   * Cancel upload
   */
  async cancel() {
    this.updateStatus('cancelled');
    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    if (this.uploadId) {
      try {
        await api.cancelChunkUpload(this.uploadId);
      } catch (_e) {}
    }
    this.notifyProgress();
  }
}
