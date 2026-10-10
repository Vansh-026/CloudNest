import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import Node from '../models/Node.js';
import User from '../models/User.js';
import Share from '../models/Share.js';
import {
  uploadFileToStorage,
  generateSignedDownloadUrl,
  deleteFileFromStorage,
} from './s3Service.js';

/**
 * Build breadcrumb trail from a given folder up to My Drive (root)
 */
export const getBreadcrumbs = async (userId, folderId) => {
  const breadcrumbs = [{ id: null, name: 'My Drive' }];

  if (!folderId || folderId === 'root' || folderId === 'null') {
    return breadcrumbs;
  }

  const pathList = [];
  let currentId = folderId;
  const visited = new Set();

  while (currentId && !visited.has(currentId.toString())) {
    visited.add(currentId.toString());

    const folder = await Node.findOne({
      _id: currentId,
      ownerId: userId,
      type: 'folder',
    }).select('_id name parentId');

    if (!folder) break;

    pathList.unshift({ id: folder._id, name: folder.name });
    currentId = folder.parentId;
  }

  return [...breadcrumbs, ...pathList];
};

/**
 * List files and folders in a directory
 */
export const listDirectory = async (userId, rawParentId) => {
  const parentId =
    !rawParentId || rawParentId === 'root' || rawParentId === 'null'
      ? null
      : new mongoose.Types.ObjectId(rawParentId);

  let currentFolder = null;
  let isSharedFolder = false;
  if (parentId) {
    currentFolder = await Node.findOne({
      _id: parentId,
      ownerId: userId,
      type: 'folder',
      trashed: false,
    });

    if (!currentFolder) {
      const share = await Share.findOne({
        nodeId: parentId,
        userId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      });
      if (share) {
        currentFolder = await Node.findOne({ _id: parentId, type: 'folder', trashed: false });
        isSharedFolder = true;
      }
    }

    if (!currentFolder) {
      const error = new Error('Folder not found or has been trashed');
      error.statusCode = 404;
      throw error;
    }
  }

  const nodesQuery = { parentId, trashed: false };
  if (!isSharedFolder) {
    nodesQuery.ownerId = userId;
  }
  const nodes = await Node.find(nodesQuery).sort({ type: -1, name: 1 }); // 'folder' before 'file', alphabetical

  const breadcrumbs = await getBreadcrumbs(userId, parentId);

  return {
    currentFolder,
    breadcrumbs,
    nodes,
  };
};

/**
 * Create a new folder
 */
export const createFolder = async (userId, { name, parentId: rawParentId }) => {
  const trimmedName = (name || '').trim();
  if (!trimmedName) {
    const error = new Error('Folder name is required');
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
      ownerId: userId,
      type: 'folder',
      trashed: false,
    });

    if (!parentFolder) {
      const error = new Error('Parent folder not found');
      error.statusCode = 404;
      throw error;
    }
  }

  const folder = await Node.create({
    name: trimmedName,
    type: 'folder',
    ownerId: userId,
    parentId,
    mimeType: 'folder',
  });

  return folder;
};

/**
 * Upload a file and update storage quota
 */
export const uploadFile = async (userId, { file, parentId: rawParentId }) => {
  if (!file) {
    const error = new Error('No file provided');
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
      ownerId: userId,
      type: 'folder',
      trashed: false,
    });

    if (!parentFolder) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      const error = new Error('Target folder not found');
      error.statusCode = 404;
      throw error;
    }
  }

  // Check user storage limit
  const user = await User.findById(userId);
  if (!user) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const currentUsed = user.storageUsed || 0;
  const limit = user.storageLimit || 10 * 1024 * 1024 * 1024;

  if (currentUsed + file.size > limit) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    const error = new Error('Storage quota exceeded');
    error.statusCode = 413;
    throw error;
  }

  // 1. Upload to storage provider (S3 or local fallback)
  const storageResult = await uploadFileToStorage({ file, userId });

  const ext = path.extname(file.originalname).toLowerCase();

  // 2. Create MongoDB metadata
  const fileNode = await Node.create({
    name: file.originalname,
    type: 'file',
    ownerId: userId,
    parentId,
    size: file.size,
    mimeType: file.mimetype || 'application/octet-stream',
    storageProvider: storageResult.storageProvider,
    storageKey: storageResult.storageKey,
    s3Bucket: storageResult.s3Bucket,
    storagePath: storageResult.storagePath,
    metadata: {
      extension: ext,
      originalName: file.originalname,
    },
  });

  // 3. Update quota
  await User.findByIdAndUpdate(userId, {
    $inc: { storageUsed: file.size },
  });

  return fileNode;
};

/**
 * Retrieve file for streaming download or preview
 */
export const getFileNode = async (userId, nodeId) => {
  let node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
    type: 'file',
  });

  if (!node) {
    const share = await Share.findOne({
      nodeId,
      userId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (share) {
      node = await Node.findOne({ _id: nodeId, type: 'file', trashed: false });
    }
  }

  if (!node) {
    const error = new Error('File not found');
    error.statusCode = 404;
    throw error;
  }

  if (node.storageProvider !== 's3') {
    let exists = false;
    try {
      exists = !!(node.storagePath && fs.existsSync(node.storagePath));
    } catch (_e) {
      exists = false;
    }

    if (!exists && node.storagePath) {
      const filename = path.basename(node.storagePath);
      const ownerIdStr = (node.ownerId || userId)?.toString();
      const candidates = [
        path.resolve('uploads', `u_${ownerIdStr}`, filename),
        path.resolve('uploads', filename),
        path.resolve('uploads', ownerIdStr, filename),
      ];
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) {
            node.storagePath = candidate;
            exists = true;
            Node.updateOne({ _id: node._id }, { $set: { storagePath: candidate } }).catch(() => {});
            break;
          }
        } catch (_e) {}
      }
    }

    if (!exists) {
      const error = new Error('File content not found on server storage');
      error.statusCode = 404;
      throw error;
    }
  }

  return node;
};

/**
 * Check ownership and generate signed S3 URL for direct download
 */
export const getFileSignedUrl = async (userId, nodeId, expiresIn = 3600) => {
  let node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
    type: 'file',
    trashed: false,
  });

  if (!node) {
    const share = await Share.findOne({
      nodeId,
      userId,
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (share) {
      node = await Node.findOne({ _id: nodeId, type: 'file', trashed: false });
    }
  }

  if (!node) {
    const error = new Error('File not found or access denied');
    error.statusCode = 404;
    throw error;
  }

  const downloadUrl = await generateSignedDownloadUrl(node, expiresIn);

  return {
    file: node,
    downloadUrl,
    expiresIn,
  };
};

/**
 * Rename file or folder
 */
export const renameNode = async (userId, nodeId, newName) => {
  const trimmed = (newName || '').trim();
  if (!trimmed) {
    const error = new Error('New name is required');
    error.statusCode = 400;
    throw error;
  }

  let node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const editorShare = await Share.findOne({
      nodeId,
      userId,
      role: 'editor',
      isActive: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (editorShare) {
      node = await Node.findOne({ _id: nodeId, trashed: false });
    }
  }

  if (!node) {
    const error = new Error('Item not found or you lack permission to rename');
    error.statusCode = 404;
    throw error;
  }

  node.name = trimmed;
  if (node.type === 'file') {
    node.metadata.extension = path.extname(trimmed).toLowerCase();
  }

  await node.save();
  return node;
};

/**
 * Move file or folder (includes cycle detection)
 */
export const moveNode = async (userId, nodeId, rawTargetParentId) => {
  const targetParentId =
    !rawTargetParentId || rawTargetParentId === 'root' || rawTargetParentId === 'null'
      ? null
      : new mongoose.Types.ObjectId(rawTargetParentId);

  if (targetParentId && nodeId.toString() === targetParentId.toString()) {
    const error = new Error('Cannot move an item into itself');
    error.statusCode = 400;
    throw error;
  }

  const node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  if (targetParentId) {
    const targetFolder = await Node.findOne({
      _id: targetParentId,
      ownerId: userId,
      type: 'folder',
      trashed: false,
    });

    if (!targetFolder) {
      const error = new Error('Target folder not found');
      error.statusCode = 404;
      throw error;
    }

    // Cycle detection: ensure targetParentId is not a descendant of nodeId
    if (node.type === 'folder') {
      let curr = targetFolder;
      const seen = new Set();
      while (curr && curr.parentId && !seen.has(curr._id.toString())) {
        seen.add(curr._id.toString());
        if (curr.parentId.toString() === node._id.toString()) {
          const error = new Error('Cannot move a folder into one of its subfolders');
          error.statusCode = 400;
          throw error;
        }
        curr = await Node.findById(curr.parentId);
      }
    }
  }

  node.parentId = targetParentId;
  await node.save();
  return node;
};

/**
 * Toggle favorite / starred
 */
export const toggleFavorite = async (userId, nodeId) => {
  const node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  node.isFavorite = !node.isFavorite;
  await node.save();
  return node;
};

/**
 * Recursive collector for all descendants of a folder
 */
const getAllDescendants = async (userId, rootId) => {
  const descendants = [];
  const queue = [rootId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = await Node.find({
      ownerId: userId,
      parentId: currentId,
    });

    for (const child of children) {
      descendants.push(child);
      if (child.type === 'folder') {
        queue.push(child._id);
      }
    }
  }

  return descendants;
};

/**
 * Move node and all descendants to trash
 */
export const trashNode = async (userId, nodeId) => {
  const node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  const now = new Date();
  node.trashed = true;
  node.trashedAt = now;
  await node.save();

  if (node.type === 'folder') {
    const descendants = await getAllDescendants(userId, node._id);
    const descendantIds = descendants.map((d) => d._id);
    if (descendantIds.length > 0) {
      await Node.updateMany(
        { _id: { $in: descendantIds } },
        { $set: { trashed: true, trashedAt: now } }
      );
    }
  }

  return node;
};

/**
 * Restore node and descendants from trash
 */
export const restoreNode = async (userId, nodeId) => {
  const node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  // If parent folder is trashed, restore to root
  if (node.parentId) {
    const parent = await Node.findById(node.parentId);
    if (!parent || parent.trashed) {
      node.parentId = null;
    }
  }

  node.trashed = false;
  node.trashedAt = null;
  await node.save();

  if (node.type === 'folder') {
    const descendants = await getAllDescendants(userId, node._id);
    const descendantIds = descendants.map((d) => d._id);
    if (descendantIds.length > 0) {
      await Node.updateMany(
        { _id: { $in: descendantIds } },
        { $set: { trashed: false, trashedAt: null } }
      );
    }
  }

  return node;
};

/**
 * Permanently delete node and physical files from disk
 */
export const deletePermanently = async (userId, nodeId) => {
  const node = await Node.findOne({
    _id: nodeId,
    ownerId: userId,
  });

  if (!node) {
    const error = new Error('Item not found');
    error.statusCode = 404;
    throw error;
  }

  let nodesToDelete = [node];
  if (node.type === 'folder') {
    const descendants = await getAllDescendants(userId, node._id);
    nodesToDelete = [...nodesToDelete, ...descendants];
  }

  let totalFreedBytes = 0;

  for (const item of nodesToDelete) {
    if (item.type === 'file') {
      await deleteFileFromStorage(item);
      totalFreedBytes += item.size || 0;
    }
  }

  const ids = nodesToDelete.map((n) => n._id);
  await Node.deleteMany({ _id: { $in: ids } });

  if (totalFreedBytes > 0) {
    const user = await User.findById(userId);
    if (user) {
      user.storageUsed = Math.max(0, (user.storageUsed || 0) - totalFreedBytes);
      await user.save();
    }
  }

  return {
    deletedCount: ids.length,
    freedBytes: totalFreedBytes,
  };
};

/**
 * List all items in Trash
 */
export const listTrash = async (userId) => {
  return Node.find({
    ownerId: userId,
    trashed: true,
  }).sort({ trashedAt: -1 });
};

/**
 * List all Starred / Favorite items
 */
export const listStarred = async (userId) => {
  return Node.find({
    ownerId: userId,
    isFavorite: true,
    trashed: false,
  }).sort({ type: -1, name: 1 });
};

/**
 * Search files and folders
 */
export const searchNodes = async (userId, query) => {
  if (!query || !query.trim()) {
    return [];
  }

  const searchRegex = new RegExp(query.trim(), 'i');

  return Node.find({
    ownerId: userId,
    name: searchRegex,
    trashed: false,
  }).sort({ type: -1, name: 1 });
};

/**
 * Storage overview for user
 */
export const getStorageOverview = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const fileCount = await Node.countDocuments({
    ownerId: userId,
    type: 'file',
    trashed: false,
  });

  const folderCount = await Node.countDocuments({
    ownerId: userId,
    type: 'folder',
    trashed: false,
  });

  const storageUsed = user.storageUsed || 0;
  const storageLimit = user.storageLimit || 10 * 1024 * 1024 * 1024;
  const usedPercentage = Math.min(100, Number(((storageUsed / storageLimit) * 100).toFixed(2)));

  return {
    storageUsed,
    storageLimit,
    usedPercentage,
    fileCount,
    folderCount,
  };
};

export default {
  getBreadcrumbs,
  listDirectory,
  createFolder,
  uploadFile,
  getFileNode,
  getFileSignedUrl,
  renameNode,
  moveNode,
  toggleFavorite,
  trashNode,
  restoreNode,
  deletePermanently,
  listTrash,
  listStarred,
  searchNodes,
  getStorageOverview,
};
