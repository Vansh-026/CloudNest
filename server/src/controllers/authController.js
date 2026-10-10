import {
  registerUser,
  verifyEmail as verifyUserEmail,
  resendVerificationEmail,
  loginUser,
  refreshSession,
  logoutUser,
  forgotPassword as forgotUserPassword,
  resetPassword as resetUserPassword,
  googleAuth,
  generateTwoFactorSecret,
  enableTwoFactor as enableUserTwoFactor,
  disableTwoFactor as disableUserTwoFactor,
  getCurrentUser,
} from '../services/authService.js';
import { getRefreshTokenCookieOptions, verifyRefreshToken } from '../utils/tokens.js';

export const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const result = await registerUser({
      name,
      email,
      password,
    });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please verify your email.',
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
      },
      verificationToken: result.verificationToken,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const token = req.body?.token || req.query?.token;

    await verifyUserEmail(token);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await resendVerificationEmail(email);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await loginUser(req.body);

    if (result.requires2FA) {
      return res.status(200).json({
        success: true,
        requires2FA: true,
        message: 'Two-factor authentication code required',
        userId: result.userId,
      });
    }

    res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

    return res.status(200).json({
      success: true,
      accessToken: result.accessToken,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'No refresh token provided',
      });
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await refreshSession(incomingRefreshToken);

    res.cookie('refreshToken', newRefreshToken, getRefreshTokenCookieOptions());

    return res.status(200).json({
      success: true,
      accessToken,
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    let userId = req.user?._id || req.user?.id;

    if (!userId && token) {
      try {
        const decoded = verifyRefreshToken(token);
        userId = decoded.userId || decoded.id;
      } catch (_err) {
        // Token might already be expired, proceed to clear cookie
      }
    }

    if (userId) {
      await logoutUser(userId);
    }

    res.clearCookie('refreshToken', getRefreshTokenCookieOptions());

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await forgotUserPassword(email);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const token = req.body.token || req.query.token;
    const { password } = req.body;

    const result = await resetUserPassword(token, password);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getGoogleAuthUrl = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/google/callback`;

  if (!clientId) {
    return res.status(200).json({
      success: true,
      configured: false,
      message: 'Google Client ID is not configured on server yet',
      clientId: null,
      redirectUri,
    });
  }

  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  return res.status(200).json({
    success: true,
    configured: true,
    clientId,
    redirectUri,
    url,
  });
};

export const googleLogin = async (req, res, next) => {
  try {
    const result = await googleAuth(req.body);

    res.cookie('refreshToken', result.refreshToken, getRefreshTokenCookieOptions());

    return res.status(200).json({
      success: true,
      accessToken: result.accessToken,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        avatar: result.user.avatar,
        emailVerified: result.user.emailVerified,
        twoFactorEnabled: result.user.twoFactorEnabled,
        role: result.user.role,
        storageUsed: result.user.storageUsed,
        storageLimit: result.user.storageLimit,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const generateTwoFactor = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const result = await generateTwoFactorSecret(userId);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const enableTwoFactor = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const token = req.body.token || req.body.twoFactorCode;

    const result = await enableUserTwoFactor(userId, token);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const disableTwoFactor = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const token = req.body.token || req.body.twoFactorCode;

    const result = await disableUserTwoFactor(userId, token);

    return res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const userId = req.user._id || req.user.id;
    const user = await getCurrentUser(userId);

    return res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        role: user.role,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
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
};
