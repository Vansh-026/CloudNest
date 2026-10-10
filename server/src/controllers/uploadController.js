import {
  initUploadSession,
  saveChunk,
  getUploadSessionStatus,
  completeUploadSession,
  cancelUploadSession,
} from '../services/chunkUploadService.js';

export const initUpload = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { filename, size, chunkSize, chunkHashes, parentId } = req.body;

    const result = await initUploadSession(userId, {
      filename,
      size: Number(size),
      chunkSize: chunkSize ? Number(chunkSize) : 5 * 1024 * 1024,
      chunkHashes,
      parentId,
    });

    res.status(200).json({
      success: true,
      message: result.isComplete ? 'File deduplicated and uploaded instantly' : 'Upload session initialized',
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const uploadChunk = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id: uploadId } = req.params;
    const { chunkIndex, hash } = req.body;

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No chunk file binary received',
      });
    }

    const result = await saveChunk(userId, uploadId, {
      chunkIndex,
      hash,
      chunkBuffer: req.file.buffer,
    });

    res.status(200).json({
      success: true,
      message: `Chunk ${result.chunkIndex} uploaded successfully`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const getUploadStatus = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id: uploadId } = req.params;

    const result = await getUploadSessionStatus(userId, uploadId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

export const completeUpload = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id: uploadId } = req.params;

    const fileNode = await completeUploadSession(userId, uploadId);

    res.status(200).json({
      success: true,
      message: 'File chunks assembled successfully',
      data: {
        file: fileNode,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const cancelUpload = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { id: uploadId } = req.params;

    const result = await cancelUploadSession(userId, uploadId);

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};
