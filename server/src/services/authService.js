import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(50),
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
  twoFactorCode: z.string().optional(),
});

/**
 * Step 10: Registration
 */
export const registerUser = async ({ name, email, password }) => {
  const existingUser = await User.findOne({ email });

  if (existingUser) {
    const error = new Error('User already exists');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verificationToken = crypto.randomBytes(32).toString('hex');

  const user = await User.create({
    name,
    email,
    passwordHash,
    emailVerificationToken: verificationToken,
    emailVerificationExpires: new Date(Date.now() + 15 * 60 * 1000),
  });

  return {
    user,
    verificationToken,
  };
};

/**
 * Step 16: Email Verification
 */
export const verifyEmail = async (token) => {
  if (!token) {
    const error = new Error('Verification token is required');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({
    emailVerificationToken: token,
    emailVerificationExpires: { $gt: new Date() },
  });

  if (!user) {
    const error = new Error('Invalid or expired verification token');
    error.statusCode = 400;
    throw error;
  }

  user.emailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return user;
};

/**
 * Resend Email Verification Token
 */
export const resendVerificationEmail = async (email) => {
  if (!email) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const error = new Error('No account found with this email');
    error.statusCode = 404;
    throw error;
  }

  if (user.emailVerified) {
    return {
      message: 'Email is already verified. You can log in.',
      alreadyVerified: true,
    };
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');
  user.emailVerificationToken = verificationToken;
  user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  return {
    message: 'Verification token generated successfully.',
    verificationToken,
  };
};

/**
 * Step 17 & 23: Login with email verification check and 2FA
 */
export const loginUser = async (inputData) => {
  const validated = loginSchema.parse(inputData);

  const user = await User.findOne({ email: validated.email }).select(
    '+password +passwordHash +twoFactorSecret'
  );

  if (!user) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await user.matchPassword(validated.password);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  // Step 17: Check if email is verified
  if (!user.emailVerified) {
    const error = new Error('Please verify your email before logging in.');
    error.statusCode = 403;
    throw error;
  }

  // Step 23: If 2FA is enabled
  if (user.twoFactorEnabled) {
    if (!validated.twoFactorCode) {
      return {
        requires2FA: true,
        userId: user._id,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      };
    }

    const verification = await verify({
      secret: user.twoFactorSecret,
      token: validated.twoFactorCode,
    });

    if (!verification?.valid) {
      const error = new Error('Invalid two-factor authentication code');
      error.statusCode = 401;
      throw error;
    }
  }

  const payload = { userId: user._id, id: user._id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ userId: user._id, id: user._id });

  user.refreshToken = refreshToken;
  await user.save();

  return {
    user,
    accessToken,
    refreshToken,
  };
};

/**
 * Step 19: Refresh Token Rotation
 */
export const refreshSession = async (incomingRefreshToken) => {
  if (!incomingRefreshToken) {
    const error = new Error('Refresh token is required');
    error.statusCode = 401;
    throw error;
  }

  let decoded;
  try {
    decoded = verifyRefreshToken(incomingRefreshToken);
  } catch (_err) {
    const error = new Error('Invalid or expired refresh token');
    error.statusCode = 401;
    throw error;
  }

  const user = await User.findById(decoded.userId || decoded.id).select('+refreshToken');
  if (!user || user.refreshToken !== incomingRefreshToken) {
    const error = new Error('Invalid refresh token or session expired');
    error.statusCode = 401;
    throw error;
  }

  // Generate fresh token pair (rotation)
  const payload = { userId: user._id, id: user._id, email: user.email, role: user.role };
  const newAccessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken({ userId: user._id, id: user._id });

  user.refreshToken = newRefreshToken;
  await user.save();

  return {
    user,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Step 20: Logout
 */
export const logoutUser = async (userId) => {
  if (userId) {
    await User.findByIdAndUpdate(userId, { refreshToken: null });
  }
};

/**
 * Step 21: Forgot Password (SHA-256 hashed token stored)
 */
export const forgotPassword = async (email) => {
  if (!email) {
    const error = new Error('Email is required');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  user.passwordResetToken = hashedToken;
  user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  return {
    message: 'If an account with that email exists, a password reset link has been sent.',
    resetToken: rawToken,
  };
};

/**
 * Step 21: Reset Password
 */
export const resetPassword = async (token, newPassword) => {
  if (!token || !newPassword) {
    const error = new Error('Token and new password are required');
    error.statusCode = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters');
    error.statusCode = 400;
    throw error;
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: new Date() },
  });

  if (!user) {
    const error = new Error('Invalid or expired password reset token');
    error.statusCode = 400;
    throw error;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  user.passwordHash = passwordHash;
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return {
    message: 'Password reset successful. You can now log in with your new password.',
  };
};

/**
 * Step 22: Google OAuth with ID Token verification, Auth Code exchange, or direct payload
 */
export const googleAuth = async ({ credential, code, googleId: directGoogleId, email: directEmail, name: directName, avatar: directAvatar }) => {
  let googleId = directGoogleId;
  let email = directEmail;
  let name = directName;
  let avatar = directAvatar;

  // 1. If Google ID Token (credential) was sent from Google Identity Services
  if (credential) {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: clientId || undefined,
      });
      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      avatar = payload.picture;
    } catch (_err) {
      // Fallback check against Google's tokeninfo API
      try {
        const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
        if (verifyRes.ok) {
          const payload = await verifyRes.json();
          googleId = payload.sub;
          email = payload.email;
          name = payload.name;
          avatar = payload.picture;
        } else {
          throw new Error('Failed to verify Google ID token');
        }
      } catch (fallbackErr) {
        const error = new Error('Invalid Google credential: ' + fallbackErr.message);
        error.statusCode = 401;
        throw error;
      }
    }
  } else if (code) {
    // 2. If OAuth authorization code was sent from redirect callback
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/google/callback`;

    if (!clientId || !clientSecret) {
      const error = new Error('Google OAuth credentials not configured on server');
      error.statusCode = 500;
      throw error;
    }

    const client = new OAuth2Client(clientId, clientSecret, redirectUri);
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      googleId = payload.sub;
      email = payload.email;
      name = payload.name;
      avatar = payload.picture;
    } else {
      // Fetch userinfo via access token
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userinfo = await userinfoRes.json();
      googleId = userinfo.sub;
      email = userinfo.email;
      name = userinfo.name;
      avatar = userinfo.picture;
    }
  }

  if (!email || !googleId) {
    const error = new Error('Google authentication failed: Email and Google ID are required');
    error.statusCode = 400;
    throw error;
  }

  let user = await User.findOne({
    $or: [{ googleId }, { email: email.toLowerCase() }],
  });

  if (!user) {
    user = await User.create({
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      googleId,
      authProvider: 'google',
      avatar: avatar || '',
      emailVerified: true,
    });
  } else {
    let updated = false;
    if (!user.googleId) {
      user.googleId = googleId;
      updated = true;
    }
    if (user.authProvider !== 'google') {
      user.authProvider = 'google';
      updated = true;
    }
    if (!user.emailVerified) {
      user.emailVerified = true;
      updated = true;
    }
    if (avatar && !user.avatar) {
      user.avatar = avatar;
      updated = true;
    }
    if (updated) {
      await user.save();
    }
  }

  const payload = { userId: user._id, id: user._id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken({ userId: user._id, id: user._id });

  user.refreshToken = refreshToken;
  await user.save();

  return {
    user,
    accessToken,
    refreshToken,
  };
};

/**
 * Step 23: 2FA Setup & Verification
 */
export const generateTwoFactorSecret = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }

  const secret = generateSecret();
  user.twoFactorSecret = secret;
  await user.save();

  const otpauthUrl = generateURI({
    issuer: 'CloudNest',
    label: user.email,
    secret,
  });

  const qrCode = await QRCode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCode,
  };
};

export const enableTwoFactor = async (userId, token) => {
  const user = await User.findById(userId).select('+twoFactorSecret');
  if (!user || !user.twoFactorSecret) {
    const error = new Error('2FA has not been initialized for this account');
    error.statusCode = 400;
    throw error;
  }

  const result = await verify({
    secret: user.twoFactorSecret,
    token,
  });

  if (!result?.valid) {
    const error = new Error('Invalid two-factor authentication code');
    error.statusCode = 400;
    throw error;
  }

  user.twoFactorEnabled = true;
  await user.save();

  return {
    message: 'Two-factor authentication enabled successfully',
  };
};

export const disableTwoFactor = async (userId, token) => {
  const user = await User.findById(userId).select('+twoFactorSecret');
  if (!user || !user.twoFactorEnabled) {
    const error = new Error('2FA is not enabled');
    error.statusCode = 400;
    throw error;
  }

  const result = await verify({
    secret: user.twoFactorSecret,
    token,
  });

  if (!result?.valid) {
    const error = new Error('Invalid two-factor authentication code');
    error.statusCode = 400;
    throw error;
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save();

  return {
    message: 'Two-factor authentication disabled',
  };
};

export const getCurrentUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  return user;
};

export default {
  registerUser,
  verifyEmail,
  resendVerificationEmail,
  loginUser,
  refreshSession,
  logoutUser,
  forgotPassword,
  resetPassword,
  googleAuth,
  generateTwoFactorSecret,
  enableTwoFactor,
  disableTwoFactor,
  getCurrentUser,
};
