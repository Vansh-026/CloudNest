import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_ROOT = path.resolve('uploads');

// Ensure root upload directory exists
if (!fs.existsSync(UPLOAD_ROOT)) {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const userId = req.user?._id?.toString() || req.user?.id?.toString() || 'anonymous';
    const userDir = path.join(UPLOAD_ROOT, `u_${userId}`);

    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }

    cb(null, userDir);
  },

  filename: (_req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const sanitizedOriginal = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${uniqueSuffix}-${sanitizedOriginal}`);
  },
});

export const upload = multer({
  storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 500 * 1024 * 1024, // 500 MB default
  },
});

export default upload;
