import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/authMiddleware.js';
import {
  initUpload,
  uploadChunk,
  getUploadStatus,
  completeUpload,
  cancelUpload,
} from '../controllers/uploadController.js';

const router = Router();

// Memory storage for chunks (max 20MB per chunk request)
const chunkStorage = multer.memoryStorage();
const chunkUploader = multer({
  storage: chunkStorage,
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Protect all chunk upload operations with auth
router.use(protect);

router.post('/init', initUpload);
router.post('/:id/chunk', chunkUploader.single('chunk'), uploadChunk);
router.get('/:id/status', getUploadStatus);
router.post('/:id/complete', completeUpload);
router.post('/:id/cancel', cancelUpload);

export default router;
