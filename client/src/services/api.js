let accessToken = localStorage.getItem('cloudnest_token') || null;

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const setToken = (token) => {
  accessToken = token;
  if (token) {
    localStorage.setItem('cloudnest_token', token);
  } else {
    localStorage.removeItem('cloudnest_token');
  }
};

export const getToken = () => accessToken;

export const apiRequest = async (url, options = {}) => {
  const targetUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const headers = { ...options.headers };

  // Do not set Content-Type for FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  let response = await fetch(targetUrl, {
    ...options,
    headers,
    credentials: 'include', // sends refresh token cookie
  });

  // If 401, attempt silent refresh token rotation once only if an active session existed
  if (response.status === 401 && accessToken && !url.includes('/auth/login') && !url.includes('/auth/refresh') && !url.includes('/auth/register')) {
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshRes.ok) {
        const refreshData = await refreshRes.json();
        if (refreshData.accessToken) {
          setToken(refreshData.accessToken);
          headers['Authorization'] = `Bearer ${refreshData.accessToken}`;

          // Retry original request
          response = await fetch(targetUrl, {
            ...options,
            headers,
            credentials: 'include',
          });
        }
      } else {
        setToken(null);
      }
    } catch (_err) {
      setToken(null);
    }
  }

  return response;
};

// Auth API
export const api = {
  // Auth
  register: async (name, email, password) => {
    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    return res.json();
  },

  verifyEmail: async (token) => {
    const res = await apiRequest('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.json();
  },

  resendVerification: async (email) => {
    const res = await apiRequest('/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  login: async (email, password, twoFactorCode) => {
    const payload = { email, password };
    if (twoFactorCode) {
      payload.twoFactorCode = twoFactorCode;
    }
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success && data.accessToken) {
      setToken(data.accessToken);
    }
    return data;
  },

  googleAuth: async (payload) => {
    const res = await apiRequest('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success && data.accessToken) {
      setToken(data.accessToken);
    }
    return data;
  },

  getGoogleAuthUrl: async () => {
    const res = await apiRequest('/api/auth/google/url');
    return res.json();
  },

  forgotPassword: async (email) => {
    const res = await apiRequest('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    return res.json();
  },

  resetPassword: async (token, password) => {
    const res = await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
    return res.json();
  },

  generate2FA: async () => {
    const res = await apiRequest('/api/auth/2fa/generate', {
      method: 'POST',
    });
    return res.json();
  },

  enable2FA: async (token) => {
    const res = await apiRequest('/api/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.json();
  },

  disable2FA: async (token) => {
    const res = await apiRequest('/api/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
    return res.json();
  },

  logout: async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  getMe: async () => {
    const res = await apiRequest('/api/auth/me');
    return res.json();
  },

  // Nodes & Files
  getNodes: async (parentId) => {
    const query = parentId ? `?parentId=${parentId}` : '';
    const res = await apiRequest(`/api/nodes${query}`);
    return res.json();
  },

  createFolder: async (name, parentId) => {
    const res = await apiRequest('/api/nodes/folder', {
      method: 'POST',
      body: JSON.stringify({ name, parentId: parentId || null }),
    });
    return res.json();
  },

  uploadFile: async (file, parentId) => {
    const formData = new FormData();
    formData.append('file', file);
    if (parentId) {
      formData.append('parentId', parentId);
    }

    const res = await apiRequest('/api/nodes/upload', {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  getFileDownloadUrl: async (id) => {
    const res = await apiRequest(`/api/nodes/${id}`);
    return res.json();
  },

  renameNode: async (id, name) => {
    const res = await apiRequest(`/api/nodes/${id}/rename`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    return res.json();
  },

  moveNode: async (id, targetParentId) => {
    const res = await apiRequest(`/api/nodes/${id}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ targetParentId }),
    });
    return res.json();
  },

  toggleStar: async (id) => {
    const res = await apiRequest(`/api/nodes/${id}/star`, {
      method: 'PATCH',
    });
    return res.json();
  },

  trashNode: async (id) => {
    const res = await apiRequest(`/api/nodes/${id}/trash`, {
      method: 'POST',
    });
    return res.json();
  },

  restoreNode: async (id) => {
    const res = await apiRequest(`/api/nodes/${id}/restore`, {
      method: 'POST',
    });
    return res.json();
  },

  deletePermanently: async (id) => {
    const res = await apiRequest(`/api/nodes/${id}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getTrash: async () => {
    const res = await apiRequest('/api/nodes/trash');
    return res.json();
  },

  getStarred: async () => {
    const res = await apiRequest('/api/nodes/starred');
    return res.json();
  },

  searchNodes: async (query) => {
    const res = await apiRequest(`/api/nodes/search?q=${encodeURIComponent(query)}`);
    return res.json();
  },

  getStorage: async () => {
    const res = await apiRequest('/api/nodes/storage');
    return res.json();
  },

  // Chunk Upload & Deduplication (Resumable)
  initChunkUpload: async ({ filename, size, chunkSize, chunkHashes, parentId }) => {
    const res = await apiRequest('/api/uploads/init', {
      method: 'POST',
      body: JSON.stringify({ filename, size, chunkSize, chunkHashes, parentId }),
    });
    return res.json();
  },

  uploadChunk: async (uploadId, chunkIndex, hash, chunkBlob, signal) => {
    const formData = new FormData();
    formData.append('chunkIndex', chunkIndex);
    formData.append('hash', hash);
    formData.append('chunk', chunkBlob);

    const res = await apiRequest(`/api/uploads/${uploadId}/chunk`, {
      method: 'POST',
      body: formData,
      signal,
    });
    return res.json();
  },

  getUploadStatus: async (uploadId) => {
    const res = await apiRequest(`/api/uploads/${uploadId}/status`);
    return res.json();
  },

  completeChunkUpload: async (uploadId) => {
    const res = await apiRequest(`/api/uploads/${uploadId}/complete`, {
      method: 'POST',
    });
    return res.json();
  },

  cancelChunkUpload: async (uploadId) => {
    const res = await apiRequest(`/api/uploads/${uploadId}/cancel`, {
      method: 'POST',
    });
    return res.json();
  },

  // Sharing API
  shareByEmail: async (nodeId, email, role, expiresAt) => {
    const res = await apiRequest('/api/shares/email', {
      method: 'POST',
      body: JSON.stringify({ nodeId, email, role, expiresAt }),
    });
    return res.json();
  },

  createShareLink: async (nodeId, role, expiresAt, password, maxDownloads) => {
    const res = await apiRequest('/api/shares/link', {
      method: 'POST',
      body: JSON.stringify({ nodeId, role, expiresAt, password, maxDownloads }),
    });
    return res.json();
  },

  getNodeShares: async (nodeId) => {
    const res = await apiRequest(`/api/shares/node/${nodeId}`);
    return res.json();
  },

  revokeShare: async (shareId) => {
    const res = await apiRequest(`/api/shares/${shareId}`, {
      method: 'DELETE',
    });
    return res.json();
  },

  getSharedWithMe: async () => {
    const res = await apiRequest('/api/shares/shared-with-me');
    return res.json();
  },

  getPublicShare: async (token, password) => {
    const headers = {};
    if (password) headers['x-share-password'] = password;
    const res = await fetch(`${API_BASE}/api/shares/public/${token}`, {
      headers,
    });
    return res.json();
  },

  verifySharePassword: async (token, password) => {
    const res = await fetch(`${API_BASE}/api/shares/public/${token}/verify-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    return res.json();
  },

  getPublicDownloadUrl: (token, password) => {
    const param = password ? `?password=${encodeURIComponent(password)}` : '';
    return `${API_BASE}/api/shares/public/${token}/download${param}`;
  },

  getPublicPreviewUrl: (token, password) => {
    const param = password ? `?password=${encodeURIComponent(password)}` : '';
    return `${API_BASE}/api/shares/public/${token}/preview${param}`;
  },
};

export default api;
