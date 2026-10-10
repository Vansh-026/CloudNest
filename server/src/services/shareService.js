import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Share from '../models/Share.js';
import Node from '../models/Node.js';
import User from '../models/User.js';
import { generateSignedDownloadUrl } from './s3Service.js';

/**
 * Generate a cryptographically secure URL-safe random token
 * E.g., 'X7ab92mKqL93'
 */
const generateSecureToken = () => {
  return crypto.randomBytes(12).toString('base64url');
};

/**
 * Share a file or folder by email with a user
 */
export const shareByEmail = async (creatorId, { nodeId, email, role = 'viewer', expiresAt = null }) => {
  const cleanEmail = (email || '').toLowerCase().trim();
  if (!cleanEmail) {
    const error = new Error('Recipient email is required');
    error.statusCode = 400;
    throw error;
  }

  const node = await Node.findById(nodeId);
  if (!node || node.trashed) {
    const error = new Error('File or folder not found');
    error.statusCode = 404;
    throw error;
  }

  // Ensure creator is owner or has editor role on the node
  if (node.ownerId.toString() !== creatorId.toString()) {
    const editShare = await Share.findOne({
      nodeId,
      userId: creatorId,
      role: 'editor',
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!editShare) {
      const error = new Error('You do not have permission to share this item');
      error.statusCode = 403;
      throw error;
    }
  }

  // Check creator is not sharing with themselves
  const creator = await User.findById(creatorId);
  if (creator && creator.email.toLowerCase() === cleanEmail) {
    const error = new Error('You cannot share an item with yourself');
    error.statusCode = 400;
    throw error;
  }

  // Check if recipient is a registered user
  const recipientUser = await User.findOne({ email: cleanEmail });

  const shareData = {
    nodeId,
    shareType: 'email',
    sharedWithEmail: cleanEmail,
    userId: recipientUser ? recipientUser._id : null,
    role: role === 'editor' ? 'editor' : 'viewer',
    createdBy: creatorId,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: true,
  };

  // Upsert share
  const share = await Share.findOneAndUpdate(
    { nodeId, sharedWithEmail: cleanEmail, shareType: 'email' },
    shareData,
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).populate('userId', 'name email avatar');

  return share;
};

/**
 * Create a public share link with secure random token
 */
export const createShareLink = async (creatorId, {
  nodeId,
  role = 'viewer',
  expiresAt = null,
  password = null,
  maxDownloads = null,
}) => {
  const node = await Node.findById(nodeId);
  if (!node || node.trashed) {
    const error = new Error('File or folder not found');
    error.statusCode = 404;
    throw error;
  }

  if (node.ownerId.toString() !== creatorId.toString()) {
    const editShare = await Share.findOne({
      nodeId,
      userId: creatorId,
      role: 'editor',
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!editShare) {
      const error = new Error('You do not have permission to share this item');
      error.statusCode = 403;
      throw error;
    }
  }

  let passwordHash = null;
  let hasPassword = false;
  if (password && password.trim().length > 0) {
    passwordHash = await bcrypt.hash(password.trim(), 10);
    hasPassword = true;
  }

  let cleanMaxDownloads = null;
  if (maxDownloads !== null && maxDownloads !== undefined && maxDownloads !== '') {
    const parsed = parseInt(maxDownloads, 10);
    if (!isNaN(parsed) && parsed > 0) {
      cleanMaxDownloads = parsed;
    }
  }

  const token = generateSecureToken();

  const share = await Share.create({
    nodeId,
    shareType: 'link',
    token,
    role: role === 'editor' ? 'editor' : 'viewer',
    createdBy: creatorId,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    passwordHash,
    hasPassword,
    maxDownloads: cleanMaxDownloads,
    downloadCount: 0,
    isActive: true,
  });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const shareUrl = `${clientUrl}/share/${token}`;

  return {
    ...share.toObject(),
    passwordHash: undefined, // never expose hash
    shareUrl,
  };
};

/**
 * Get all active shares for a node (both email and link)
 */
export const getNodeShares = async (userId, nodeId) => {
  const node = await Node.findById(nodeId);
  if (!node || node.trashed) {
    const error = new Error('File or folder not found');
    error.statusCode = 404;
    throw error;
  }

  // Ensure caller is owner or editor
  const isOwner = node.ownerId.toString() === userId.toString();
  if (!isOwner) {
    const editorShare = await Share.findOne({
      nodeId,
      userId,
      role: 'editor',
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!editorShare) {
      const error = new Error('Access denied');
      error.statusCode = 403;
      throw error;
    }
  }

  const shares = await Share.find({ nodeId, isActive: true })
    .populate('userId', 'name email avatar')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 });

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  return shares.map((s) => {
    const obj = s.toObject();
    delete obj.passwordHash;
    if (obj.token) {
      obj.shareUrl = `${clientUrl}/share/${obj.token}`;
    }
    return obj;
  });
};

/**
 * Revoke/delete a share
 */
export const revokeShare = async (userId, shareId) => {
  const share = await Share.findById(shareId);
  if (!share) {
    const error = new Error('Share not found');
    error.statusCode = 404;
    throw error;
  }

  const node = await Node.findById(share.nodeId);
  const isOwner = node && node.ownerId.toString() === userId.toString();
  const isCreator = share.createdBy.toString() === userId.toString();

  if (!isOwner && !isCreator) {
    const error = new Error('You do not have permission to revoke this share');
    error.statusCode = 403;
    throw error;
  }

  share.isActive = false;
  await share.save();

  return { success: true, message: 'Share link revoked successfully' };
};

/**
 * Get items shared with the current user
 */
export const getSharedWithMe = async (userId, userEmail) => {
  const now = new Date();
  const shares = await Share.find({
    isActive: true,
    shareType: 'email',
    $or: [
      { userId },
      { sharedWithEmail: (userEmail || '').toLowerCase().trim() },
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: now } },
    ],
  })
    .populate({
      path: 'nodeId',
      match: { trashed: false },
    })
    .populate('createdBy', 'name email avatar')
    .sort({ createdAt: -1 });

  // Filter out any shares where node is deleted
  const validShares = shares.filter((s) => s.nodeId !== null);

  return validShares.map((s) => ({
    shareId: s._id,
    role: s.role,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    sharedBy: s.createdBy,
    node: s.nodeId,
  }));
};

/**
 * Validate and retrieve public share info by token
 */
export const getPublicShare = async (token, password = null) => {
  const share = await Share.findOne({ token, isActive: true })
    .populate('nodeId')
    .populate('createdBy', 'name email');

  if (!share) {
    const error = new Error('Shared link not found or has been revoked');
    error.statusCode = 404;
    throw error;
  }

  // Check expiration
  if (share.expiresAt && new Date() > share.expiresAt) {
    const error = new Error('This share link has expired');
    error.statusCode = 410;
    throw error;
  }

  // Check download limit
  if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) {
    const error = new Error('The download limit for this link has been reached');
    error.statusCode = 403;
    throw error;
  }

  const node = share.nodeId;
  if (!node || node.trashed) {
    const error = new Error('The shared item is no longer available');
    error.statusCode = 404;
    throw error;
  }

  // Check password if required
  if (share.hasPassword && share.passwordHash) {
    if (!password) {
      return {
        requiresPassword: true,
        nodeName: node.name,
        type: node.type,
        sharedBy: share.createdBy?.name || 'Someone',
      };
    }

    const isMatch = await bcrypt.compare(password, share.passwordHash);
    if (!isMatch) {
      const error = new Error('Incorrect password for shared file');
      error.statusCode = 401;
      throw error;
    }
  }

  let folderContents = [];
  if (node.type === 'folder') {
    folderContents = await Node.find({
      parentId: node._id,
      trashed: false,
    }).sort({ type: -1, name: 1 });
  }

  return {
    requiresPassword: false,
    share: {
      id: share._id,
      role: share.role,
      expiresAt: share.expiresAt,
      maxDownloads: share.maxDownloads,
      downloadCount: share.downloadCount,
      hasPassword: share.hasPassword,
      sharedBy: share.createdBy,
      createdAt: share.createdAt,
    },
    node,
    folderContents,
  };
};

/**
 * Process public download (increment downloadCount and generate signed download URL)
 */
export const downloadPublicShare = async (token, password = null) => {
  const publicData = await getPublicShare(token, password);
  if (publicData.requiresPassword) {
    const error = new Error('Password required to download this file');
    error.statusCode = 401;
    throw error;
  }

  const share = await Share.findOne({ token, isActive: true });
  const node = publicData.node;

  if (node.type !== 'file') {
    const error = new Error('Direct download only supported for files');
    error.statusCode = 400;
    throw error;
  }

  // Increment download counter
  await Share.findByIdAndUpdate(share._id, { $inc: { downloadCount: 1 } });

  const downloadUrl = await generateSignedDownloadUrl(node, 3600);

  return {
    node,
    downloadUrl,
    downloadCount: share.downloadCount + 1,
    maxDownloads: share.maxDownloads,
  };
};

/**
 * Check if a user has access to a node via direct ownership, share, or parent folder share
 */
export const checkUserNodeAccess = async (userId, userEmail, nodeId, requiredRole = 'viewer') => {
  const node = await Node.findById(nodeId);
  if (!node) return { hasAccess: false, role: null, node: null };

  // Owner always has full access
  if (userId && node.ownerId.toString() === userId.toString()) {
    return { hasAccess: true, role: 'owner', node };
  }

  // Check direct share
  const now = new Date();
  const query = {
    nodeId: node._id,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
  };

  const userConditions = [];
  if (userId) userConditions.push({ userId });
  if (userEmail) userConditions.push({ sharedWithEmail: userEmail.toLowerCase().trim() });

  if (userConditions.length > 0) {
    query.$or = userConditions;
  }

  let directShare = await Share.findOne(query);

  // If not direct, check ancestor folders!
  if (!directShare && node.parentId) {
    let currentParentId = node.parentId;
    const visited = new Set();

    while (currentParentId && !visited.has(currentParentId.toString())) {
      visited.add(currentParentId.toString());

      const parentShare = await Share.findOne({
        nodeId: currentParentId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        ...(userConditions.length > 0 ? { $or: userConditions } : {}),
      });

      if (parentShare) {
        directShare = parentShare;
        break;
      }

      const parentNode = await Node.findById(currentParentId).select('parentId');
      if (!parentNode) break;
      currentParentId = parentNode.parentId;
    }
  }

  if (directShare) {
    if (requiredRole === 'viewer' || directShare.role === 'editor') {
      return { hasAccess: true, role: directShare.role, node };
    }
  }

  return { hasAccess: false, role: null, node };
};
