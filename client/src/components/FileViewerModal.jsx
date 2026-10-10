import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  Share2,
  ExternalLink,
  Copy,
  Check,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Code,
  File,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { getToken, API_BASE } from '../services/api';

const formatBytes = (bytes = 0) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss',
  'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb',
  'sql', 'sh', 'bash', 'zsh', 'bat', 'cmd', 'yaml', 'yml', 'xml', 'csv',
  'tsv', 'log', 'env', 'config', 'gitignore', 'dockerfile',
]);

export default function FileViewerModal({ node, isOpen, onClose, onDownload, onShare }) {
  const [textContent, setTextContent] = useState(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [imageError, setImageError] = useState(false);

  const ext = (node?.metadata?.extension || node?.name?.split('.').pop() || '').replace('.', '').toLowerCase();
  const mime = (node?.mimeType || '').toLowerCase();

  const isPdf = mime.includes('pdf') || ext === 'pdf';
  const isImage = mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico'].includes(ext);
  const isVideo = mime.startsWith('video/') || ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'm4v'].includes(ext);
  const isAudio = mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext);
  const isText = mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript') || TEXT_EXTENSIONS.has(ext);

  const token = getToken();
  const previewUrl = node ? `${API_BASE}/api/nodes/${node._id}/preview${token ? `?token=${encodeURIComponent(token)}` : ''}` : '';

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Load text content for code and text files
  useEffect(() => {
    if (isOpen && node && isText && !isPdf && !isImage && !isVideo && !isAudio) {
      setTextLoading(true);
      setTextError(null);
      setTextContent(null);

      fetch(previewUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`Failed to load file (${res.status} ${res.statusText})`);
          const text = await res.text();
          setTextContent(text);
        })
        .catch((err) => {
          setTextError(err.message || 'Failed to read file content');
        })
        .finally(() => {
          setTextLoading(false);
        });
    }
  }, [isOpen, node, isText, previewUrl, token]);

  if (!isOpen || !node) return null;

  const handleCopyText = () => {
    if (textContent) {
      navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenNewTab = () => {
    window.open(previewUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--modal-backdrop)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          height: '64px',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
          flexShrink: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* File Name & Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', overflow: 'hidden', flex: 1 }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {isPdf && <FileText size={20} color="#ef4444" />}
            {isImage && <ImageIcon size={20} color="#10b981" />}
            {isVideo && <Film size={20} color="#8b5cf6" />}
            {isAudio && <Music size={20} color="#ec4899" />}
            {isText && <Code size={20} color="#3b82f6" />}
            {!isPdf && !isImage && !isVideo && !isAudio && !isText && <File size={20} color="var(--text-muted)" />}
          </div>

          <div style={{ overflow: 'hidden', minWidth: 0 }}>
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 'clamp(120px, 35vw, 480px)',
              }}
              title={node.name}
            >
              {node.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <span>{formatBytes(node.size)}</span>
              <span>•</span>
              <span style={{ textTransform: 'uppercase' }}>{ext || 'FILE'}</span>
              <span>•</span>
              <span>{new Date(node.updatedAt || Date.now()).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          {isImage && (
            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '2px', marginRight: '4px' }}>
              <button
                className="btn-icon"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                title="Zoom Out"
                style={{ width: '30px', height: '30px' }}
              >
                <ZoomOut size={14} />
              </button>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-primary)', minWidth: '38px', textAlign: 'center', fontWeight: 600 }}>
                {Math.round(zoomLevel * 100)}%
              </span>
              <button
                className="btn-icon"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                title="Zoom In"
                style={{ width: '30px', height: '30px' }}
              >
                <ZoomIn size={14} />
              </button>
              <button
                className="btn-icon"
                onClick={() => setZoomLevel(1)}
                title="Reset Zoom"
                style={{ width: '30px', height: '30px' }}
              >
                <Maximize2 size={13} />
              </button>
            </div>
          )}

          {isText && textContent && (
            <button
              className="btn btn-secondary"
              onClick={handleCopyText}
              style={{ padding: '7px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              title="Copy content"
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span className="viewer-btn-text">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          )}

          <button
            className="btn btn-secondary"
            onClick={handleOpenNewTab}
            style={{ padding: '7px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Open in new window"
          >
            <ExternalLink size={14} />
            <span className="viewer-btn-text">Open</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={() => onShare?.(node)}
            style={{ padding: '7px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Share file"
          >
            <Share2 size={14} />
            <span className="viewer-btn-text">Share</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => onDownload?.(node)}
            style={{ padding: '7px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Download file"
          >
            <Download size={14} />
            <span className="viewer-btn-text">Download</span>
          </button>

          <button
            onClick={onClose}
            className="btn-icon"
            style={{
              padding: '6px',
              borderRadius: '8px',
              marginLeft: '4px',
            }}
            title="Close viewer (Esc)"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Main Content Viewer Canvas */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          overflow: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* PDF Document Viewer */}
        {isPdf && (
          <div
            style={{
              width: '100%',
              height: '100%',
              maxWidth: '1100px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.7)',
              background: '#ffffff',
            }}
          >
            <iframe
              src={previewUrl}
              title={node.name}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </div>
        )}

        {/* Image Viewer */}
        {isImage && !imageError && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              overflow: 'auto',
            }}
          >
            <img
              src={previewUrl}
              alt={node.name}
              onError={() => setImageError(true)}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
                transform: `scale(${zoomLevel})`,
                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            />
          </div>
        )}

        {/* Video Player */}
        {isVideo && (
          <div
            style={{
              maxWidth: '1000px',
              width: '100%',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
              background: '#000000',
            }}
          >
            <video
              controls
              autoPlay
              src={previewUrl}
              style={{ width: '100%', maxHeight: '78vh', display: 'block' }}
            >
              Your browser does not support HTML5 video preview.
            </video>
          </div>
        )}

        {/* Audio Player */}
        {isAudio && (
          <div
            className="glass-modal"
            style={{
              width: '520px',
              maxWidth: '100%',
              padding: '40px 32px',
              borderRadius: '24px',
              textAlign: 'center',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7), 0 0 40px rgba(236, 72, 153, 0.25)',
            }}
          >
            <div
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                boxShadow: '0 10px 25px rgba(236, 72, 153, 0.4)',
              }}
            >
              <Music size={36} color="#ffffff" />
            </div>

            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {node.name}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              {formatBytes(node.size)}
            </p>

            <audio
              controls
              autoPlay
              src={previewUrl}
              style={{ width: '100%', outline: 'none' }}
            />
          </div>
        )}

        {/* Text & Code Viewer */}
        {isText && !isPdf && (
          <div
            className="glass-modal"
            style={{
              width: '1000px',
              maxWidth: '100%',
              height: '80vh',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              border: '1px solid var(--border-subtle)',
            }}
          >
            {textLoading && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
                <RefreshCw size={20} className="animate-spin" />
                <span>Loading file content...</span>
              </div>
            )}

            {textError && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ef4444', padding: '24px' }}>
                <AlertCircle size={36} style={{ marginBottom: '12px' }} />
                <p>{textError}</p>
                <button
                  onClick={() => onDownload?.(node)}
                  className="btn btn-primary"
                  style={{ marginTop: '16px' }}
                >
                  Download File
                </button>
              </div>
            )}

            {!textLoading && !textError && textContent !== null && (
              <div style={{ flex: 1, overflow: 'auto', background: 'var(--code-bg)', padding: '16px', display: 'flex' }}>
                {/* Line numbers */}
                <div
                  style={{
                    userSelect: 'none',
                    paddingRight: '16px',
                    marginRight: '16px',
                    borderRight: '1px solid var(--border-subtle)',
                    textAlign: 'right',
                    color: 'var(--text-muted)',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    lineHeight: '1.6',
                  }}
                >
                  {textContent.split('\n').map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>

                {/* Code / Text Lines */}
                <pre
                  style={{
                    flex: 1,
                    margin: 0,
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    lineHeight: '1.6',
                    color: 'var(--code-text)',
                    whiteSpace: 'pre',
                    overflowX: 'auto',
                  }}
                >
                  {textContent}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Fallback for binary / unsupported preview types */}
        {!isPdf && !isImage && !isVideo && !isAudio && !isText && (
          <div
            className="glass-modal"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '40px 32px',
              borderRadius: '24px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '20px',
                background: 'var(--bg-active)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}
            >
              <File size={36} color="var(--accent-primary)" />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
              {node.name}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              {formatBytes(node.size)} • {node.mimeType || 'Binary file'}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Direct in-browser preview is not supported for this file format. You can download the file to view it locally.
            </p>

            <button
              onClick={() => onDownload?.(node)}
              className="btn btn-primary"
              style={{ width: '100%', padding: '12px' }}
            >
              <Download size={18} />
              <span>Download File</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
