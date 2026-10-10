import mongoose from 'mongoose';

const uploadSessionSchema = new mongoose.Schema(
  {
    uploadId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      default: null,
    },
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    size: {
      type: Number,
      required: true,
    },
    chunkSize: {
      type: Number,
      required: true,
      default: 5 * 1024 * 1024, // 5MB
    },
    totalChunks: {
      type: Number,
      required: true,
    },
    chunkHashes: {
      type: [String],
      required: true,
    },
    completedChunks: {
      type: [Number],
      default: [],
    },
    status: {
      type: String,
      enum: ['pending', 'uploading', 'paused', 'completed', 'cancelled'],
      default: 'uploading',
      index: true,
    },
    fileNodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      default: null,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days TTL
      index: { expires: 0 },
    },
  },
  {
    timestamps: true,
  }
);

uploadSessionSchema.index({ userId: 1, status: 1 });

const UploadSession = mongoose.model('UploadSession', uploadSessionSchema);

export default UploadSession;
