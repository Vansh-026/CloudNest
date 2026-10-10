import React, { useState, useEffect } from 'react';
import {
  Share2,
  Mail,
  Link as LinkIcon,
  Copy,
  Check,
  Trash2,
  Clock,
  Lock,
  Download,
  Shield,
  User,
  Users,
  X,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { api } from '../services/api';

export default function ShareModal({ node, isOpen, onClose, currentUser, showToast }) {
  const [activeTab, setActiveTab] = useState('people'); // 'people' | 'link'
  const [loading, setLoading] = useState(false);
  const [shares, setShares] = useState([]);

  // Email form
  const [email, setEmail] = useState('');
  const [emailRole, setEmailRole] = useState('viewer'); // 'viewer' | 'editor'
  const [emailExpiry, setEmailExpiry] = useState('');

  // Link form
  const [linkRole, setLinkRole] = useState('viewer');
  const [linkExpiryDays, setLinkExpiryDays] = useState('never'); // 'never', '1', '7', '30', 'custom'
  const [linkCustomDate, setLinkCustomDate] = useState('');
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [enableDownloadLimit, setEnableDownloadLimit] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState('5');
  const [copiedToken, setCopiedToken] = useState(null);

  useEffect(() => {
    if (isOpen && node) {
      loadShares();
    }
  }, [isOpen, node]);

  const loadShares = async () => {
    if (!node) return;
    setLoading(true);
    try {
      const res = await api.getNodeShares(node._id);
      if (res.success) {
        setShares(res.data || []);
      }
    } catch (err) {
      showToast?.('Failed to load sharing details', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !node) return null;

  const handleShareEmail = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    try {
      const res = await api.shareByEmail(
        node._id,
        email.trim(),
        emailRole,
        emailExpiry ? new Date(emailExpiry).toISOString() : null
      );

      if (res.success) {
        showToast?.(`Shared "${node.name}" with ${email.trim()}`);
        setEmail('');
        setEmailExpiry('');
        loadShares();
      } else {
        showToast?.(res.message || 'Failed to share', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'Error sharing by email', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (e) => {
    e.preventDefault();
    setLoading(true);

    let calculatedExpiry = null;
    if (linkExpiryDays === 'custom' && linkCustomDate) {
      calculatedExpiry = new Date(linkCustomDate).toISOString();
    } else if (linkExpiryDays !== 'never') {
      const days = parseInt(linkExpiryDays, 10);
      calculatedExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    try {
      const res = await api.createShareLink(
        node._id,
        linkRole,
        calculatedExpiry,
        enablePassword && password.trim() ? password.trim() : null,
        enableDownloadLimit && maxDownloads ? parseInt(maxDownloads, 10) : null
      );

      if (res.success) {
        showToast?.('Public share link created');
        setPassword('');
        loadShares();
      } else {
        showToast?.(res.message || 'Failed to create link', 'error');
      }
    } catch (err) {
      showToast?.(err.message || 'Error creating link', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeShare = async (shareId) => {
    try {
      const res = await api.revokeShare(shareId);
      if (res.success) {
        showToast?.('Share revoked');
        loadShares();
      }
    } catch (err) {
      showToast?.('Failed to revoke share', 'error');
    }
  };

  const handleCopyLink = (shareUrl, token) => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedToken(token);
    showToast?.('Link copied to clipboard');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const emailShares = shares.filter((s) => s.shareType === 'email');
  const linkShares = shares.filter((s) => s.shareType === 'link');

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="glass-modal"
        style={{
          width: '560px',
          maxWidth: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '20px',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, overflow: 'hidden' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Share2 size={20} color="#ffffff" />
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <h2
                style={{
                  fontSize: '1.1rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
                title={node.name}
              >
                Share "{node.name}"
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Manage email collaborators & public links
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-icon"
            style={{ padding: '8px', borderRadius: '8px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab switch */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--border-subtle)',
            padding: '0 24px',
            background: 'var(--bg-tertiary)',
          }}
        >
          <button
            onClick={() => setActiveTab('people')}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'people' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'people' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <Users size={16} />
            Invite People ({emailShares.length})
          </button>
          <button
            onClick={() => setActiveTab('link')}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'link' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'link' ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <LinkIcon size={16} />
            Public Links ({linkShares.length})
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'people' && (
            <div>
              {/* Add Person Form */}
              <form onSubmit={handleShareEmail} style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Mail
                      size={16}
                      color="var(--text-muted)"
                      style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
                    />
                    <input
                      type="email"
                      required
                      placeholder="Add email address (e.g. bob@example.com)"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input"
                      style={{
                        paddingLeft: '38px',
                      }}
                    />
                  </div>

                  <select
                    value={emailRole}
                    onChange={(e) => setEmailRole(e.target.value)}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={14} color="#94a3b8" />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Expires (optional):</span>
                    <input
                      type="date"
                      value={emailExpiry}
                      onChange={(e) => setEmailExpiry(e.target.value)}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '6px',
                        color: '#f8fafc',
                        fontSize: '0.75rem',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                  >
                    Share
                  </button>
                </div>
              </form>

              {/* Collaborators List */}
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  People with access
                </h4>

                {/* Owner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-subtle)',
                    marginBottom: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                      }}
                    >
                      {currentUser?.name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {currentUser?.name} (You)
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {currentUser?.email}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '4px 10px',
                      borderRadius: '99px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      color: 'var(--accent-primary)',
                    }}
                  >
                    Owner
                  </span>
                </div>

                {/* Existing Shares */}
                {emailShares.map((s) => (
                  <div
                    key={s._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: s.role === 'editor' ? '#8b5cf6' : '#10b981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.8rem',
                        }}
                      >
                        {s.sharedWithEmail?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {s.userId?.name || s.sharedWithEmail}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {s.sharedWithEmail}
                          {s.expiresAt && ` · Expires ${new Date(s.expiresAt).toLocaleDateString()}`}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: '99px',
                          background: s.role === 'editor' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: s.role === 'editor' ? '#8b5cf6' : '#10b981',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s.role}
                      </span>
                      <button
                        onClick={() => handleRevokeShare(s._id)}
                        className="btn-icon"
                        style={{ color: '#ef4444', padding: '4px' }}
                        title="Remove access"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'link' && (
            <div>
              {/* Create Link Box */}
              <form
                onSubmit={handleCreateLink}
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '14px' }}>
                  Generate New Public Link
                </div>

                {/* Role and Expiry */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Role Permission
                    </label>
                    <select
                      value={linkRole}
                      onChange={(e) => setLinkRole(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    >
                      <option value="viewer">Viewer (View & Download)</option>
                      <option value="editor">Editor (View, Download & Edit)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '4px' }}>
                      Expiration
                    </label>
                    <select
                      value={linkExpiryDays}
                      onChange={(e) => setLinkExpiryDays(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    >
                      <option value="never">Never expires</option>
                      <option value="1">1 Day</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                      <option value="custom">Custom Date</option>
                    </select>
                  </div>
                </div>

                {linkExpiryDays === 'custom' && (
                  <div style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Custom Expiration Date
                    </label>
                    <input
                      type="date"
                      value={linkCustomDate}
                      onChange={(e) => setLinkCustomDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--input-color)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                )}

                {/* Password Protection Toggle */}
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={enablePassword}
                      onChange={(e) => setEnablePassword(e.target.checked)}
                      style={{ accentColor: '#6366f1' }}
                    />
                    Require Password
                  </label>
                  {enablePassword && (
                    <input
                      type="password"
                      placeholder="Enter access password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required={enablePassword}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--input-bg)',
                        border: '1px solid var(--input-border)',
                        borderRadius: '8px',
                        color: 'var(--input-color)',
                        fontSize: '0.85rem',
                        outline: 'none',
                      }}
                    />
                  )}
                </div>

                {/* Download Limit Toggle */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                    <input
                      type="checkbox"
                      checked={enableDownloadLimit}
                      onChange={(e) => setEnableDownloadLimit(e.target.checked)}
                      style={{ accentColor: '#6366f1' }}
                    />
                    Limit Total Downloads
                  </label>
                  {enableDownloadLimit && (
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={maxDownloads}
                        onChange={(e) => setMaxDownloads(e.target.value)}
                        style={{
                          width: '120px',
                          padding: '8px 12px',
                          background: 'var(--input-bg)',
                          border: '1px solid var(--input-border)',
                          borderRadius: '8px',
                          color: 'var(--input-color)',
                          fontSize: '0.85rem',
                          outline: 'none',
                        }}
                      />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>maximum downloads</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '10px' }}
                >
                  <LinkIcon size={16} />
                  Create Public Share Link
                </button>
              </form>

              {/* Active Public Links */}
              <div>
                <h4 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  Active Public Links
                </h4>

                {linkShares.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No public links generated yet.
                  </div>
                ) : (
                  linkShares.map((link) => (
                    <div
                      key={link._id}
                      style={{
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        padding: '14px',
                        marginBottom: '10px',
                      }}
                    >
                      {/* URL Box */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          marginBottom: '10px',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.8rem',
                            color: 'var(--accent-primary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '360px',
                          }}
                        >
                          {link.shareUrl}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            onClick={() => handleCopyLink(link.shareUrl, link.token)}
                            className="btn btn-secondary"
                            style={{
                              padding: '5px 10px',
                              fontSize: '0.75rem',
                              borderRadius: '6px',
                            }}
                          >
                            {copiedToken === link.token ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                            {copiedToken === link.token ? 'Copied' : 'Copy'}
                          </button>
                          <a
                            href={link.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              padding: '5px',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>

                      {/* Meta pills & Revoke */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '99px',
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#a5b4fc',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                            }}
                          >
                            {link.role}
                          </span>

                          {link.hasPassword && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '99px',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#fbbf24',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Lock size={10} /> Password
                            </span>
                          )}

                          {link.maxDownloads !== null && link.maxDownloads !== undefined && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '99px',
                                background: 'rgba(59, 130, 246, 0.15)',
                                color: '#60a5fa',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Download size={10} /> {link.downloadCount || 0} / {link.maxDownloads} downloads
                            </span>
                          )}

                          {link.expiresAt && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '99px',
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Clock size={10} /> Exp: {new Date(link.expiresAt).toLocaleDateString()}
                            </span>
                          )}
                        </div>

                        <button
                          onClick={() => handleRevokeShare(link._id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#ef4444',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 6px',
                          }}
                        >
                          <Trash2 size={13} /> Revoke
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
