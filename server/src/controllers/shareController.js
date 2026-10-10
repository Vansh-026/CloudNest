import fs from 'fs';
import path from 'path';
import {
  shareByEmail as shareByEmailService,
  createShareLink as createShareLinkService,
  getNodeShares as getNodeSharesService,
  revokeShare as revokeShareService,
  getSharedWithMe as getSharedWithMeService,
  getPublicShare as getPublicShareService,
  downloadPublicShare as downloadPublicShareService,
} from '../services/shareService.js';
import Share from '../models/Share.js';
import Node from '../models/Node.js';

export const shareByEmail = async (req, res, next) => {
  try {
    const creatorId = req.user._id;
    const { nodeId, email, role, expiresAt } = req.body;

    const share = await shareByEmailService(creatorId, {
      nodeId,
      email,
      role,
      expiresAt,
    });

    res.status(200).json({
      success: true,
      message: `Shared successfully with ${email}`,
      data: share,
    });
  } catch (err) {
    next(err);
  }
};

export const createShareLink = async (req, res, next) => {
  try {
    const creatorId = req.user._id;
    const { nodeId, role, expiresAt, password, maxDownloads } = req.body;

    const share = await createShareLinkService(creatorId, {
      nodeId,
      role,
      expiresAt,
      password,
      maxDownloads,
    });

    res.status(201).json({
      success: true,
      message: 'Share link created successfully',
      data: share,
    });
  } catch (err) {
    next(err);
  }
};

export const getNodeShares = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { nodeId } = req.params;

    const shares = await getNodeSharesService(userId, nodeId);

    res.status(200).json({
      success: true,
      data: shares,
    });
  } catch (err) {
    next(err);
  }
};

export const revokeShare = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id: shareId } = req.params;

    const result = await revokeShareService(userId, shareId);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

export const getSharedWithMe = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const userEmail = req.user.email;

    const items = await getSharedWithMeService(userId, userEmail);

    res.status(200).json({
      success: true,
      data: items,
    });
  } catch (err) {
    next(err);
  }
};

export const getPublicShare = async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.headers['x-share-password'] || req.query.password || null;

    const result = await getPublicShareService(token, password);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const verifySharePassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const result = await getPublicShareService(token, password);

    res.status(200).json({
      success: true,
      message: 'Password verified successfully',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const downloadPublicShare = async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.headers['x-share-password'] || req.query.password || null;

    const result = await downloadPublicShareService(token, password);

    // If local storage file stream:
    if (result.node.storageProvider === 'local' && result.node.storagePath && fs.existsSync(result.node.storagePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.node.name)}"`);
      res.setHeader('Content-Type', result.node.mimeType || 'application/octet-stream');
      return fs.createReadStream(result.node.storagePath).pipe(res);
    }

    // If S3 or redirect signed URL:
    res.status(200).json({
      success: true,
      data: {
        downloadUrl: result.downloadUrl,
        downloadCount: result.downloadCount,
        maxDownloads: result.maxDownloads,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const previewPublicShare = async (req, res, next) => {
  try {
    const { token } = req.params;
    const password = req.headers['x-share-password'] || req.query.password || null;

    const result = await getPublicShareService(token, password);
    if (result.requiresPassword) {
      return res.status(401).json({ success: false, message: 'Password required' });
    }

    const node = result.node;
    if (node.storageProvider === 'local' && node.storagePath && fs.existsSync(node.storagePath)) {
      res.setHeader('Content-Type', node.mimeType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(node.name)}"`);
      return fs.createReadStream(node.storagePath).pipe(res);
    }

    // S3 preview url
    const downloadData = await downloadPublicShareService(token, password);
    res.redirect(downloadData.downloadUrl);
  } catch (err) {
    next(err);
  }
};
