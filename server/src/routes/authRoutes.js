import { Router } from 'express';
import {
  register,
  verifyEmail,
  resendVerification,
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  getGoogleAuthUrl,
  googleLogin,
  generateTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
  getMe,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/google/url', getGoogleAuthUrl);
router.post('/google', googleLogin);

// Protected routes
router.get('/me', protect, getMe);
router.post('/2fa/generate', protect, generateTwoFactor);
router.post('/2fa/enable', protect, enableTwoFactor);
router.post('/2fa/disable', protect, disableTwoFactor);

export default router;
