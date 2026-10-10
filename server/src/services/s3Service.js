import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const isS3Configured = () => {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
};

export const getS3Client = () => {
  if (!isS3Configured()) return null;

  const clientConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  };

  if (process.env.AWS_ENDPOINT) {
    clientConfig.endpoint = process.env.AWS_ENDPOINT;
    clientConfig.forcePathStyle = true;
  }

  return new S3Client(clientConfig);
};

/**
 * Upload a file to S3 (or local S3-compatible storage if AWS credentials are not set)
 */
export const uploadFileToStorage = async ({ file, userId, key }) => {
  const sanitizedName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
  const storageKey =
    key ||
    `users/${userId}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${sanitizedName}`;

  if (isS3Configured()) {
    try {
      const s3Client = getS3Client();
      const fileStream = fs.createReadStream(file.path);

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: storageKey,
        Body: fileStream,
        ContentType: file.mimetype || 'application/octet-stream',
        Metadata: {
          ownerId: userId.toString(),
          originalName: encodeURIComponent(file.originalname),
        },
      });

      await s3Client.send(command);

      // Remove local temp multer upload after successful S3 upload
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        storageProvider: 's3',
        storageKey,
        s3Bucket: process.env.AWS_S3_BUCKET,
        storagePath: `s3://${process.env.AWS_S3_BUCKET}/${storageKey}`,
      };
    } catch (s3Err) {
      console.warn(`[S3 Storage Fallback] S3 PutObject failed (${s3Err.message}). Storing locally on disk.`);
    }
  }

  // Local storage mode fallback: file remains in uploads/
  return {
    storageProvider: 'local',
    storageKey,
    storagePath: file.path,
  };
};

/**
 * Generate Presigned Download URL
 * - If S3: Generates AWS S3 Presigned URL via @aws-sdk/s3-request-presigner
 * - If Local: Generates cryptographically signed URL pointing to /api/files/download-signed
 */
export const generateSignedDownloadUrl = async (node, expiresIn = 3600) => {
  if (node.storageProvider === 's3' && isS3Configured()) {
    const s3Client = getS3Client();
    const bucket = node.s3Bucket || process.env.AWS_S3_BUCKET;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: node.storageKey,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(node.name)}"`,
      ResponseContentType: node.mimeType || 'application/octet-stream',
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  // Cryptographically signed URL for local development/fallback
  const secret = process.env.JWT_SECRET || 'cloudnest_signed_download_secret_key';
  const token = jwt.sign(
    {
      nodeId: node._id.toString(),
      ownerId: node.ownerId.toString(),
      type: 'signed_download',
    },
    secret,
    { expiresIn: `${expiresIn}s` }
  );

  const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${baseUrl}/api/files/download-signed?token=${token}`;
};

/**
 * Verify signed download token
 */
export const verifySignedDownloadToken = (token) => {
  const secret = process.env.JWT_SECRET || 'cloudnest_signed_download_secret_key';
  return jwt.verify(token, secret);
};

/**
 * Delete file from S3 or local disk
 */
export const deleteFileFromStorage = async (node) => {
  if (node.storageProvider === 's3' && isS3Configured() && node.storageKey) {
    try {
      const s3Client = getS3Client();
      const bucket = node.s3Bucket || process.env.AWS_S3_BUCKET;
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: node.storageKey,
        })
      );
    } catch (err) {
      console.warn(`[S3 Warning] Failed to delete S3 object ${node.storageKey}:`, err.message);
    }
  } else if (node.storagePath && fs.existsSync(node.storagePath)) {
    try {
      fs.unlinkSync(node.storagePath);
    } catch (err) {
      console.warn(`[Storage Warning] Failed to delete file ${node.storagePath}:`, err.message);
    }
  }
};

export default {
  isS3Configured,
  getS3Client,
  uploadFileToStorage,
  generateSignedDownloadUrl,
  verifySignedDownloadToken,
  deleteFileFromStorage,
};
