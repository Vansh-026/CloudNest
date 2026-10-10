import fs from 'fs';
import Node from '../models/Node.js';
import {
  listDirectory,
  createFolder as createNewFolder,
  uploadFile as saveUploadedFile,
  getFileNode,
  getFileSignedUrl,
  renameNode as renameExistingNode,
  moveNode as moveExistingNode,
  toggleFavorite as toggleNodeFavorite,
  trashNode as trashExistingNode,
  restoreNode as restoreExistingNode,
  deletePermanently as deleteNodePermanently,
  listTrash,
  listStarred,
  searchNodes,
  getStorageOverview,
} from '../services/nodeService.js';
import { verifySignedDownloadToken } from '../services/s3Service.js';

export const getNodes = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const parentId = req.query.parentId || req.query.folderId;

    const result = await listDirectory(userId, parentId);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const createFolder = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, parentId } = req.body;

    const folder = await createNewFolder(userId, { name, parentId });

    return res.status(201).json({
      success: true,
      message: 'Folder created successfully',
      data: {
        folder,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadFile = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const file = req.file;
    const parentId = req.body.parentId || req.query.parentId;

    const fileNode = await saveUploadedFile(userId, { file, parentId });

    return res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        file: fileNode,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /files/:id
 * Check ownership, generate signed S3 URL, and return metadata or redirect
 */
export const getFileWithSignedUrl = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const result = await getFileSignedUrl(userId, id);

    // If client requested direct redirect or download
    if (req.query.download === 'true' || req.query.redirect === 'true') {
      return res.redirect(result.downloadUrl);
    }

    return res.status(200).json({
      success: true,
      message: 'Signed download URL generated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle direct download (supports S3 redirect or local disk stream)
 */
export const downloadFile = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const result = await getFileSignedUrl(userId, id);
    if (result.file.storageProvider === 's3') {
      return res.redirect(result.downloadUrl);
    }

    return res.download(result.file.storagePath, result.file.name);
  } catch (error) {
    next(error);
  }
};

/**
 * Verify signed local token for fallback downloads (GET /files/download-signed?token=...)
 */
export const downloadSignedFile = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Signed token is required' });
    }

    const decoded = verifySignedDownloadToken(token);
    const node = await Node.findById(decoded.nodeId);

    if (!node || !node.storagePath || !fs.existsSync(node.storagePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    return res.download(node.storagePath, node.name);
  } catch (_error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired signed URL' });
  }
};

export const previewFile = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const node = await getFileNode(userId, id);

    if (node.storageProvider === 's3') {
      const result = await getFileSignedUrl(userId, id);
      return res.redirect(result.downloadUrl);
    }

    if (!node.storagePath || !fs.existsSync(node.storagePath)) {
      return res.status(404).json({ success: false, message: 'File content not found on server storage' });
    }

    res.setHeader('Content-Type', node.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(node.name)}"`
    );

    const stream = fs.createReadStream(node.storagePath);
    stream.on('error', (err) => next(err));
    stream.pipe(res);
  } catch (error) {
    next(error);
  }
};

export const renameNode = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { name } = req.body;

    const updated = await renameExistingNode(userId, id, name);

    return res.status(200).json({
      success: true,
      message: 'Item renamed successfully',
      data: {
        node: updated,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const moveNode = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;
    const { targetParentId } = req.body;

    const updated = await moveExistingNode(userId, id, targetParentId);

    return res.status(200).json({
      success: true,
      message: 'Item moved successfully',
      data: {
        node: updated,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const toggleStar = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const updated = await toggleNodeFavorite(userId, id);

    return res.status(200).json({
      success: true,
      message: updated.isFavorite ? 'Added to starred' : 'Removed from starred',
      data: {
        node: updated,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const trashNode = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const trashed = await trashExistingNode(userId, id);

    return res.status(200).json({
      success: true,
      message: 'Item moved to trash',
      data: {
        node: trashed,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const restoreNode = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const restored = await restoreExistingNode(userId, id);

    return res.status(200).json({
      success: true,
      message: 'Item restored from trash',
      data: {
        node: restored,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const deletePermanently = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const { id } = req.params;

    const result = await deleteNodePermanently(userId, id);

    return res.status(200).json({
      success: true,
      message: 'Item permanently deleted',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getTrash = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const items = await listTrash(userId);

    return res.status(200).json({
      success: true,
      data: {
        nodes: items,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStarred = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const items = await listStarred(userId);

    return res.status(200).json({
      success: true,
      data: {
        nodes: items,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const search = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const query = req.query.q || req.query.query;

    const results = await searchNodes(userId, query);

    return res.status(200).json({
      success: true,
      data: {
        nodes: results,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getStorage = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const storage = await getStorageOverview(userId);

    return res.status(200).json({
      success: true,
      data: storage,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  getNodes,
  createFolder,
  uploadFile,
  downloadFile,
  getFileWithSignedUrl,
  downloadSignedFile,
  previewFile,
  renameNode,
  moveNode,
  toggleStar,
  trashNode,
  restoreNode,
  deletePermanently,
  getTrash,
  getStarred,
  search,
  getStorage,
};
