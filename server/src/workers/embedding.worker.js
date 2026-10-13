import crypto from 'crypto';
import FileEmbedding from '../models/FileEmbedding.js';
import jobLogger from '../utils/jobLogger.js';

/**
 * Normalizes text by removing non-printable/control characters and trimming whitespace
 */
export const normalizeText = (text) => {
  if (!text) return '';
  return text
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Splits text into overlapping chunks
 */
export const chunkText = (text, chunkSize = 500, overlap = 50) => {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  if (normalized.length <= chunkSize) {
    return [normalized];
  }

  const chunks = [];
  let startIndex = 0;

  while (startIndex < normalized.length) {
    const endIndex = Math.min(startIndex + chunkSize, normalized.length);
    const chunk = normalized.slice(startIndex, endIndex).trim();

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    if (endIndex >= normalized.length) break;
    startIndex += chunkSize - overlap;
  }

  return chunks;
};

/**
 * Mock deterministic embedding generator (384-dimensional unit vector)
 * Generates realistic vectors from text hash for local dev & testing without external API calls.
 */
const generateMockEmbedding = (text, dimensions = 384) => {
  const hash = crypto.createHash('sha256').update(text).digest();
  const vector = [];
  let norm = 0;

  for (let i = 0; i < dimensions; i++) {
    const val = (hash[i % hash.length] / 127.5) - 1.0;
    vector.push(val);
    norm += val * val;
  }

  // Normalize to unit length
  const sqrtNorm = Math.sqrt(norm) || 1;
  return vector.map((v) => Number((v / sqrtNorm).toFixed(6)));
};

/**
 * Pluggable provider vector generator
 */
export const generateEmbeddings = async (textChunks, provider = 'mock') => {
  const targetProvider = (provider || process.env.EMBEDDING_PROVIDER || 'mock').toLowerCase();
  const apiKey = process.env.EMBEDDING_API_KEY;

  if (targetProvider === 'openai') {
    if (!apiKey) {
      throw new Error('OpenAI embedding requested but EMBEDDING_API_KEY is not configured');
    }

    // Call OpenAI Embeddings API
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: textChunks,
        model: 'text-embedding-3-small',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    return {
      vectors: data.data.map((item) => item.embedding),
      dimensions: data.data[0]?.embedding?.length || 1536,
      provider: 'openai',
      model: 'text-embedding-3-small',
    };
  }

  // Default / Mock / Local development provider
  return {
    vectors: textChunks.map((chunk) => generateMockEmbedding(chunk, 384)),
    dimensions: 384,
    provider: 'local-mock',
    model: 'mock-bge-small-en-384',
  };
};

/**
 * Embedding Worker Processor
 */
export const processEmbedding = async (fileNode, extractedText = null) => {
  const isEnabled = process.env.ENABLE_EMBEDDINGS === 'true';

  if (!isEnabled) {
    return {
      embeddingStatus: 'skipped',
      reason: 'Embeddings disabled in configuration (ENABLE_EMBEDDINGS!=true)',
    };
  }

  const textToEmbed = extractedText || fileNode.processing?.extractedText;

  if (!textToEmbed || textToEmbed.trim().length === 0) {
    return {
      embeddingStatus: 'skipped',
      reason: 'No extracted text available for generating embeddings',
    };
  }

  const fileIdStr = fileNode._id.toString();
  const userIdStr = (fileNode.ownerId || 'system').toString();

  try {
    jobLogger.info(`Normalizing and chunking text for file ${fileIdStr}...`);
    const chunks = chunkText(textToEmbed, 500, 50);

    if (chunks.length === 0) {
      return {
        embeddingStatus: 'skipped',
        reason: 'Extracted text contained no printable characters',
      };
    }

    jobLogger.info(`Generating vector embeddings for ${chunks.length} text chunks (${fileIdStr})...`);
    const { vectors, dimensions, provider, model } = await generateEmbeddings(
      chunks,
      process.env.EMBEDDING_PROVIDER || 'mock'
    );

    // Atomically replace existing embeddings for this file to ensure idempotency
    await FileEmbedding.deleteMany({ fileId: fileNode._id });

    const embeddingDocs = chunks.map((chunk, idx) => ({
      fileId: fileNode._id,
      userId: fileNode.ownerId,
      chunkIndex: idx,
      chunkText: chunk,
      embedding: vectors[idx],
      dimensions,
      provider,
      model,
    }));

    await FileEmbedding.insertMany(embeddingDocs);
    jobLogger.info(`Saved ${embeddingDocs.length} vector embedding documents to MongoDB (${dimensions}d).`);

    return {
      embeddingStatus: 'completed',
      chunkCount: chunks.length,
      dimensions,
      provider,
      model,
    };
  } catch (err) {
    jobLogger.error(`Embedding worker failed for ${fileIdStr}: ${err.message}`, err);
    return {
      embeddingStatus: 'failed',
      error: err.message,
    };
  }
};

export default {
  normalizeText,
  chunkText,
  generateEmbeddings,
  processEmbedding,
};
