import mongoose from 'mongoose';

/**
 * FileEmbedding Model
 * Stores normalized chunks and vector embeddings separately from Node documents
 * to prevent MongoDB 16MB document size limit issues and facilitate Atlas Vector Search.
 */
const fileEmbeddingSchema = new mongoose.Schema(
  {
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    chunkText: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
    dimensions: {
      type: Number,
      required: true,
    },
    provider: {
      type: String,
      required: true,
    },
    model: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying all embeddings of a file in chunk order
fileEmbeddingSchema.index({ fileId: 1, chunkIndex: 1 });
fileEmbeddingSchema.index({ userId: 1, fileId: 1 });

const FileEmbedding = mongoose.model('FileEmbedding', fileEmbeddingSchema);

export default FileEmbedding;
