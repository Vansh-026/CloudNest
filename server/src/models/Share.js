import mongoose from 'mongoose';

const shareSchema = new mongoose.Schema(
  {
    nodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Node',
      required: [true, 'Node ID is required'],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sharedWithEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ['viewer', 'editor'],
      default: 'viewer',
      required: [true, 'Role must be either viewer or editor'],
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Creator user ID is required'],
      index: true,
    },
    shareType: {
      type: String,
      enum: ['email', 'link'],
      required: true,
      index: true,
    },
    token: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: null,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    hasPassword: {
      type: Boolean,
      default: false,
    },
    maxDownloads: {
      type: Number,
      default: null, // null means unlimited
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

shareSchema.index({ nodeId: 1, userId: 1 });
shareSchema.index({ nodeId: 1, sharedWithEmail: 1 });
shareSchema.index({ token: 1, isActive: 1 });

const Share = mongoose.model('Share', shareSchema);

export default Share;
