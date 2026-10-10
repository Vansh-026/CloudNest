import React, { useState } from 'react';
import {
  UploadCloud,
  Pause,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  File,
} from 'lucide-react';

export default function UploadQueueModal({ uploads = [], onPause, onResume, onCancel, onClearCompleted }) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (!uploads || uploads.length === 0) return null;

  const activeCount = uploads.filter((u) => u.status === 'uploading' || u.status === 'hashing').length;
  const completedCount = uploads.filter((u) => u.status === 'completed').length;

  return (
    <div
      className="glass-modal upload-dock-card"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '420px',
        maxWidth: 'calc(100vw - 48px)',
        zIndex: 9999,
        borderRadius: '16px',
        overflow: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Header */}
      <div
        className="upload-dock-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          cursor: 'pointer',
        }}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1, #a855f7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <UploadCloud size={18} color="#ffffff" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Upload Manager
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {activeCount > 0 ? `${activeCount} uploading` : `${completedCount} completed`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {completedCount > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearCompleted?.();
              }}
              className="btn-secondary"
              style={{
                fontSize: '0.75rem',
                cursor: 'pointer',
                padding: '4px 8px',
                borderRadius: '6px',
              }}
            >
              Clear
            </button>
          )}
          <button
            className="btn-icon"
            style={{
              padding: '4px',
            }}
          >
            {isCollapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Upload Items List */}
      {!isCollapsed && (
        <div style={{ maxHeight: '360px', overflowY: 'auto', padding: '12px' }}>
          {uploads.map((item) => {
            const isCompleted = item.status === 'completed';
            const isPaused = item.status === 'paused';
            const isUploading = item.status === 'uploading';
            const isHashing = item.status === 'hashing';
            const isError = item.status === 'error';
            const percent = item.percent || 0;

            return (
              <div
                key={item.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px',
                  marginBottom: '10px',
                  position: 'relative',
                  boxShadow: 'var(--card-shadow)',
                }}
              >
                {/* Title & Actions */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1 }}>
                    <File size={16} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={item.filename}
                    >
                      {item.filename}
                    </span>
                  </div>

                  {/* Action Controls: Pause, Resume, Cancel */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}>
                    {isUploading && (
                      <button
                        title="Pause Upload"
                        onClick={() => onPause?.(item.id)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.1)',
                          border: 'none',
                          color: '#e2e8f0',
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Pause size={14} />
                      </button>
                    )}

                    {isPaused && (
                      <button
                        title="Resume Upload"
                        onClick={() => onResume?.(item.id)}
                        style={{
                          background: 'rgba(99, 102, 241, 0.3)',
                          border: '1px solid rgba(99, 102, 241, 0.5)',
                          color: '#a5b4fc',
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Play size={14} />
                      </button>
                    )}

                    {!isCompleted && (
                      <button
                        title="Cancel Upload"
                        onClick={() => onCancel?.(item.id)}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: 'none',
                          color: '#f87171',
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}

                    {isCompleted && (
                      <CheckCircle2 size={18} color="#10b981" />
                    )}
                  </div>
                </div>

                {/* Progress Details */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '6px' }}>
                  <span>
                    {isHashing && 'Computing SHA-256 chunk hashes...'}
                    {isUploading && `Uploading chunk ${(item.completedCount || 0) + 1} of ${item.totalChunks}...`}
                    {isPaused && 'Paused'}
                    {isCompleted && 'Uploaded & Assembled'}
                    {isError && (item.error || 'Upload error')}
                  </span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0' }}>{percent}%</span>
                </div>

                {/* Graphical Progress Bar */}
                <div
                  style={{
                    height: '6px',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    overflow: 'hidden',
                    marginBottom: '8px',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${percent}%`,
                      background: isError
                        ? '#ef4444'
                        : isCompleted
                        ? '#10b981'
                        : isPaused
                        ? '#f59e0b'
                        : 'linear-gradient(90deg, #6366f1, #a855f7)',
                      borderRadius: '4px',
                      transition: 'width 0.25s ease-out',
                    }}
                  />
                </div>

                {/* ASCII Terminal-style Progress String (Requested by user) */}
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '0.72rem',
                    color: '#818cf8',
                    letterSpacing: '0.5px',
                    background: 'rgba(0, 0, 0, 0.35)',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{item.asciiBar || `[${percent}%]`}</span>
                  {item.deduplicatedCount > 0 && (
                    <span
                      style={{
                        color: '#10b981',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '0.7rem',
                      }}
                      title={`${item.deduplicatedCount} chunks skipped via SHA-256 deduplication`}
                    >
                      <Zap size={11} fill="#10b981" />
                      {item.deduplicatedCount} deduped
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
