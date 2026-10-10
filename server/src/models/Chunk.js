import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema(
  {
    hash: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    size: {
      type: Number,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    refCount: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

const Chunk = mongoose.model('Chunk', chunkSchema);

export default Chunk;
