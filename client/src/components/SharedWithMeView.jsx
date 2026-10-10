import React, { useState, useEffect } from 'react';
import {
  Users,
  File,
  Folder,
  Download,
  Eye,
  Clock,
  Shield,
  Search,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api';

const formatBytes = (bytes = 0) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export default function SharedWithMeView({ onOpenFolder, onPreviewFile, showToast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadShared();
  }, []);

  const loadShared = async () => {
    setLoading(true);
    try {
      const res = await api.getSharedWithMe();
      if (res.success) {
        setItems(res.data || []);
      }
    } catch (err) {
      showToast?.('Failed to load shared items', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file) => {
    try {
      showToast?.(`Downloading ${file.name}...`);
      const res = await api.getFileDownloadUrl(file._id);
      if (res.success && res.data?.downloadUrl) {
        const link = document.createElement('a');
        link.href = res.data.downloadUrl;
        link.download = file.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      showToast?.(err.message, 'error');
    }
  };

  const filtered = items.filter((item) =>
    item.node?.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sharedBy?.name?.toLowerCase().includes(search.toLowerCase()) ||
    item.sharedBy?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '24px 32px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Shared with me
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Files and folders shared with your account
          </p>
        </div>

        {/* Search filter */}
        <div style={{ position: 'relative', width: '280px' }}>
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            className="input"
            placeholder="Search shared files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '36px', height: '38px', borderRadius: '10px' }}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
          Loading shared items...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '80px 20px',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border-subtle)',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <Users size={48} color="var(--text-muted)" style={{ marginBottom: '16px' }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
            No items shared with you
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            When others share files or folders with your email, they will appear here.
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--card-shadow)',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Name</th>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Shared By</th>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Role</th>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Size</th>
                <th style={{ padding: '14px 20px', fontWeight: 600 }}>Expiry</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const node = item.node;
                const isFolder = node?.type === 'folder';

                return (
                  <tr
                    key={item.shareId}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (isFolder) onOpenFolder?.(node._id);
                          else onPreviewFile?.(node);
                        }}
                      >
                        {isFolder ? (
                          <Folder size={20} color="#f59e0b" />
                        ) : (
                          <File size={20} color="var(--accent-primary)" />
                        )}
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {node?.name}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 20px', color: 'var(--text-primary)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '50%',
                            background: 'var(--accent-gradient)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          {item.sharedBy?.name?.charAt(0) || 'U'}
                        </div>
                        <span>{item.sharedBy?.name || item.sharedBy?.email}</span>
                      </div>
                    </td>

                    <td style={{ padding: '14px 20px' }}>
                      <span
                        className={item.role === 'editor' ? 'badge-warning' : 'badge-success'}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {item.role}
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                      {isFolder ? '—' : formatBytes(node?.size)}
                    </td>

                    <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'Never'}
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        {!isFolder && (
                          <>
                            <button
                              onClick={() => onPreviewFile?.(node)}
                              className="btn-icon"
                              title="Preview"
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              onClick={() => handleDownload(node)}
                              className="btn-icon"
                              style={{ color: 'var(--accent-primary)' }}
                              title="Download"
                            >
                              <Download size={16} />
                            </button>
                          </>
                        )}

                        {isFolder && (
                          <button
                            onClick={() => onOpenFolder?.(node._id)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            Open Folder
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
