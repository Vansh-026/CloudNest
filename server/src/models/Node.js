import mongoose from 'mongoose';

const nodeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Node name is required'],
      trim: true,
      maxlength: [255, 'Node name cannot exceed 255 characters'],
    },

    type: {
      type: String,
      enum: ['file', 'folder'],
      required: [true, 'Node type must be either "file" or "folder"'],
      index: true,
    },

    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Owner ID is required'],
      index: true,
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      default: null,
      index: true,
    },

    size: {
      type: Number,
      default: 0, // in bytes
    },

    mimeType: {
      type: String,
      default: function () {
        return this.type === 'folder' ? 'folder' : 'application/octet-stream';
      },
    },

    storagePath: {
      type: String,
      default: null, // Local disk path if stored locally
    },

    storageKey: {
      type: String,
      default: null, // S3 Object key
      index: true,
    },

    storageProvider: {
      type: String,
      enum: ['s3', 'local'],
      default: 'local',
      index: true,
    },

    s3Bucket: {
      type: String,
      default: null,
    },

    trashed: {
      type: Boolean,
      default: false,
      index: true,
    },

    trashedAt: {
      type: Date,
      default: null,
    },

    isFavorite: {
      type: Boolean,
      default: false,
      index: true,
    },

    metadata: {
      extension: { type: String, default: '' },
      originalName: { type: String, default: '' },
      checksum: { type: String, default: '' },
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for optimal queries
nodeSchema.index({ ownerId: 1, parentId: 1, trashed: 1 });
nodeSchema.index({ ownerId: 1, trashed: 1, isFavorite: 1 });
nodeSchema.index({ ownerId: 1, name: 'text' });

const Node = mongoose.model('Node', nodeSchema);

export default Node;
