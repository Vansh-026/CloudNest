import jwt from 'jsonwebtoken';

const getAccessSecret = () =>
  process.env.JWT_ACCESS_SECRET ||
  process.env.JWT_SECRET ||
  'cloudnest_jwt_access_secret_super_secure_key_2026';

const getAccessExpires = () =>
  process.env.JWT_ACCESS_EXPIRES ||
  process.env.JWT_EXPIRES_IN ||
  '15m';

const getRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET ||
  process.env.REFRESH_TOKEN_SECRET ||
  'cloudnest_jwt_refresh_secret_super_secure_key_2026';

const getRefreshExpires = () =>
  process.env.JWT_REFRESH_EXPIRES ||
  process.env.REFRESH_TOKEN_EXPIRES_IN ||
  '7d';

/**
 * Generate Access Token
 * Supports passing either userId or a full payload object
 */
export const generateAccessToken = (userIdOrPayload) => {
  const payload =
    typeof userIdOrPayload === 'object' && userIdOrPayload !== null
      ? {
          ...userIdOrPayload,
          userId: userIdOrPayload.userId || userIdOrPayload.id,
          id: userIdOrPayload.id || userIdOrPayload.userId,
        }
      : {
          userId: userIdOrPayload,
          id: userIdOrPayload,
        };

  return jwt.sign(payload, getAccessSecret(), {
    expiresIn: getAccessExpires(),
  });
};

/**
 * Generate Refresh Token
 * Supports passing either userId or a full payload object
 */
export const generateRefreshToken = (userIdOrPayload) => {
  const payload =
    typeof userIdOrPayload === 'object' && userIdOrPayload !== null
      ? {
          ...userIdOrPayload,
          userId: userIdOrPayload.userId || userIdOrPayload.id,
          id: userIdOrPayload.id || userIdOrPayload.userId,
        }
      : {
          userId: userIdOrPayload,
          id: userIdOrPayload,
        };

  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: getRefreshExpires(),
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, getAccessSecret());
};

export const verifyRefreshToken = (token) => {
  return jwt.verify(token, getRefreshSecret());
};

export const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
});

export default {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  getRefreshTokenCookieOptions,
};
