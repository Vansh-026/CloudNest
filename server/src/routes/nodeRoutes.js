import { Router } from 'express';
import { protect } from '../middleware/authMiddleware.js';
import upload from '../utils/uploader.js';
import {
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
} from '../controllers/nodeController.js';

const router = Router();

// Public signed URL download fallback (validated via crypto HMAC token)
router.get('/download-signed', downloadSignedFile);

// Protect remaining file endpoints with JWT Bearer authentication
router.use(protect);

// Directory Browsing & Special Views
router.get('/', getNodes);
router.get('/storage', getStorage);
router.get('/trash', getTrash);
router.get('/starred', getStarred);
router.get('/search', search);

// Creations
router.post('/folder', createFolder);
router.post('/upload', upload.single('file'), uploadFile);

// S3 Signed URL & File Streaming
router.get('/:id', getFileWithSignedUrl);
router.get('/:id/download', downloadFile);
router.get('/:id/preview', previewFile);

// Metadata & Lifecycle modifications
router.patch('/:id/rename', renameNode);
router.patch('/:id/move', moveNode);
router.patch('/:id/star', toggleStar);
router.post('/:id/trash', trashNode);
router.post('/:id/restore', restoreNode);
router.delete('/:id', deletePermanently);

export default router;
