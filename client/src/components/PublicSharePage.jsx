import React, { useState, useEffect } from 'react';
import {
  Cloud,
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code,
  Download,
  Lock,
  Clock,
  AlertCircle,
  Eye,
  Check,
  Shield,
  Folder,
  Sun,
  Moon,
} from 'lucide-react';
import { api } from '../services/api';

const formatBytes = (bytes = 0) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getFileIcon = (mimeType = '', ext = '') => {
  const extension = (ext || '').replace('.', '').toLowerCase();
  if (mimeType.includes('pdf') || extension === 'pdf') return { icon: FileText, color: '#ef4444', label: 'PDF' };
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) return { icon: ImageIcon, color: '#10b981', label: 'IMAGE' };
  if (mimeType.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi'].includes(extension)) return { icon: Film, color: '#8b5cf6', label: 'VIDEO' };
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension)) return { icon: Music, color: '#ec4899', label: 'AUDIO' };
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(extension)) return { icon: Archive, color: '#f59e0b', label: 'ARCHIVE' };
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java'].includes(extension)) return { icon: Code, color: '#3b82f6', label: 'CODE' };
  return { icon: File, color: '#64748b', label: 'FILE' };
};

export default function PublicSharePage({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareData, setShareData] = useState(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('cloudnest_theme') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cloudnest_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    loadShare();
  }, [token]);

  const loadShare = async (pwd = null) => {
    setLoading(true);
    setError(null);
    setPasswordError('');

    try {
      const res = await api.getPublicShare(token, pwd);
      if (res.requiresPassword) {
        setRequiresPassword(true);
        setShareData(res);
      } else if (res.success && res.data) {
        setRequiresPassword(false);
        setShareData(res.data);
      } else {
        setError(res.message || 'Unable to access shared item');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setPasswordError('');
    try {
      const res = await api.getPublicShare(token, password.trim());
      if (res.requiresPassword) {
        setPasswordError('Incorrect password');
      } else if (res.success && res.data) {
        setRequiresPassword(false);
        setShareData(res.data);
      } else {
        setPasswordError(res.message || 'Incorrect password');
      }
    } catch (err) {
      setPasswordError(err.message || 'Invalid password');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const downloadUrl = api.getPublicDownloadUrl(token, password);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = shareData?.node?.name || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setTimeout(() => loadShare(password), 1500);
    } catch (err) {
      alert(`Download error: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const node = shareData?.node;
  const share = shareData?.share;
  const isImage = node?.mimeType?.startsWith('image/');
  const isVideo = node?.mimeType?.startsWith('video/');
  const isAudio = node?.mimeType?.startsWith('audio/');
  const isPdf = node?.mimeType?.includes('pdf');
  const previewUrl = api.getPublicPreviewUrl(token, password);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          padding: '16px 32px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
          backdropFilter: 'blur(16px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="brand-icon" style={{ width: '38px', height: '38px' }}>
            <Cloud size={20} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
              CloudNest
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Secure Public File Sharing</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Theme Toggle */}
          <button
            type="button"
            className="btn-icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-md)',
              color: theme === 'dark' ? '#fbbf24' : '#4f46e5',
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-tertiary)',
            }}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <a
            href="/"
            className="btn btn-secondary"
            style={{ fontSize: '0.85rem', padding: '8px 16px' }}
          >
            Sign in to CloudNest
          </a>
        </div>
      </header>

      {/* Main Body */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '36px 20px',
        }}
      >
        {loading && !requiresPassword && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '3px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <div style={{ color: 'var(--text-secondary)' }}>Loading shared content...</div>
          </div>
        )}

        {error && !loading && (
          <div
            className="glass-modal"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '36px 28px',
              borderRadius: '20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.12)',
                color: 'var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <AlertCircle size={28} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
              Link Unavailable
            </h2>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '24px' }}>
              {error}
            </p>
            <a href="/" className="btn btn-primary" style={{ width: '100%' }}>
              Go to CloudNest Home
            </a>
          </div>
        )}

        {/* Password Prompt */}
        {requiresPassword && (
          <div
            className="glass-modal"
            style={{
              maxWidth: '420px',
              width: '100%',
              padding: '32px 28px',
              borderRadius: '20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '16px',
                background: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--color-warning)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <Lock size={26} />
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '6px' }}>
              Password Required
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              This file is protected with a password by{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{shareData?.sharedBy || 'the owner'}</strong>.
            </p>

            <form onSubmit={handlePasswordSubmit}>
              <input
                type="password"
                required
                autoFocus
                placeholder="Enter password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                style={{
                  marginBottom: '14px',
                  textAlign: 'center',
                  padding: '12px',
                  fontSize: '1rem',
                }}
              />

              {passwordError && (
                <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '16px' }}>
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password.trim()}
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px' }}
              >
                Unlock & View File
              </button>
            </form>
          </div>
        )}

        {/* Valid Shared File Display */}
        {!loading && !error && !requiresPassword && node && (
          <div
            className="glass-modal"
            style={{
              maxWidth: '740px',
              width: '100%',
              borderRadius: '24px',
              overflow: 'hidden',
              boxShadow: 'var(--modal-shadow)',
            }}
          >
            {/* Top Preview Area */}
            <div
              style={{
                background: 'var(--bg-tertiary)',
                minHeight: '260px',
                maxHeight: '440px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {isImage && (
                <img
                  src={previewUrl}
                  alt={node.name}
                  style={{ maxHeight: '420px', maxWidth: '100%', objectFit: 'contain' }}
                />
              )}

              {isVideo && (
                <video
                  controls
                  src={previewUrl}
                  style={{ maxHeight: '420px', maxWidth: '100%' }}
                />
              )}

              {isAudio && (
                <div style={{ padding: '40px', width: '100%', textAlign: 'center' }}>
                  <Music size={48} color="#ec4899" style={{ marginBottom: '16px' }} />
                  <audio controls src={previewUrl} style={{ width: '80%', maxWidth: '400px' }} />
                </div>
              )}

              {isPdf && (
                <iframe
                  src={previewUrl}
                  title={node.name}
                  style={{ width: '100%', height: '420px', border: 'none', background: '#ffffff' }}
                />
              )}

              {!isImage && !isVideo && !isAudio && !isPdf && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  {React.createElement(getFileIcon(node.mimeType, node.metadata?.extension).icon, {
                    size: 64,
                    color: getFileIcon(node.mimeType, node.metadata?.extension).color,
                    style: { marginBottom: '12px' },
                  })}
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {node.mimeType || 'Binary file'}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Meta & Actions Area */}
            <div style={{ padding: '28px 32px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                  gap: '16px',
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      marginBottom: '6px',
                      wordBreak: 'break-word',
                    }}
                  >
                    {node.name}
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <span>{formatBytes(node.size)}</span>
                    <span>•</span>
                    <span>Shared by {share?.sharedBy?.name || 'User'}</span>
                    <span>•</span>
                    <span>{new Date(node.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="btn btn-primary"
                  style={{
                    padding: '12px 24px',
                    fontSize: '0.95rem',
                    flexShrink: 0,
                  }}
                >
                  <Download size={18} />
                  {downloading ? 'Downloading...' : 'Download File'}
                </button>
              </div>

              {/* Status and Limits Info */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} color="var(--accent-primary)" />
                  <span>Access: <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{share?.role || 'Viewer'}</strong></span>
                </div>

                {share?.maxDownloads !== null && share?.maxDownloads !== undefined && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>•</span>
                    <Download size={14} color="var(--accent-primary)" />
                    <span>
                      Downloads remaining:{' '}
                      <strong style={{ color: 'var(--accent-primary)' }}>
                        {Math.max(0, share.maxDownloads - (share.downloadCount || 0))}
                      </strong>{' '}
                      of {share.maxDownloads}
                    </span>
                  </div>
                )}

                {share?.expiresAt && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>•</span>
                    <Clock size={14} color="var(--color-warning)" />
                    <span>Expires: <strong style={{ color: 'var(--color-warning)' }}>{new Date(share.expiresAt).toLocaleDateString()}</strong></span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
