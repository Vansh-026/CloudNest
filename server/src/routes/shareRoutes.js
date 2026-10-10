import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  shareByEmail,
  createShareLink,
  getNodeShares,
  revokeShare,
  getSharedWithMe,
  getPublicShare,
  verifySharePassword,
  downloadPublicShare,
  previewPublicShare,
} from '../controllers/shareController.js';

const router = Router();

// Publicly accessible share endpoints
router.get('/public/:token', getPublicShare);
router.post('/public/:token/verify-password', verifySharePassword);
router.get('/public/:token/download', downloadPublicShare);
router.get('/public/:token/preview', previewPublicShare);

// Protected share endpoints
router.use(protect);

router.post('/email', shareByEmail);
router.post('/link', createShareLink);
router.get('/shared-with-me', getSharedWithMe);
router.get('/node/:nodeId', getNodeShares);
router.delete('/:id', revokeShare);

export default router;
