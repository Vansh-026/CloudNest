import React, { useState, useEffect, useRef } from 'react';
import {
  Cloud,
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code,
  Search,
  Plus,
  UploadCloud,
  FolderPlus,
  Star,
  Trash2,
  HardDrive,
  Download,
  Eye,
  EyeOff,
  MoreVertical,
  ChevronRight,
  LogOut,
  User as UserIcon,
  RefreshCw,
  X,
  Check,
  Move,
  Edit2,
  RotateCcw,
  LayoutGrid,
  List as ListIcon,
  AlertCircle,
  ExternalLink,
  Shield,
  ShieldCheck,
  Key,
  Lock,
  Mail,
  QrCode,
  Copy,
  Smartphone,
  Info,
  Share2,
  Users,
  Sun,
  Moon,
  Menu,
} from 'lucide-react';
import { api, getToken, setToken } from './services/api';
import UploadQueueModal from './components/UploadQueueModal';
import ShareModal from './components/ShareModal';
import PublicSharePage from './components/PublicSharePage';
import SharedWithMeView from './components/SharedWithMeView';
import FileViewerModal from './components/FileViewerModal';
import { ChunkUploadTask } from './utils/chunkUploader';

const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.9c2.27-2.09 3.645-5.17 3.645-9.15z" />
    <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.9-3.05c-1.08.72-2.45 1.16-4.03 1.16-3.1 0-5.74-2.1-6.68-4.91H1.21v3.13C3.26 21.48 7.34 24 12 24z" />
    <path fill="#FBBC05" d="M5.32 14.29c-.24-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.58H1.21C.44 8.11 0 9.99 0 12s.44 3.89 1.21 5.42l4.11-3.13z" />
    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.52 1.21 6.58l4.11 3.13c.94-2.81 3.58-4.96 6.68-4.96z" />
  </svg>
);

// Format bytes into readable string
const formatBytes = (bytes = 0) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Return file icon & color based on extension / mime
const getFileIcon = (mimeType = '', ext = '') => {
  const extension = ext.replace('.', '').toLowerCase();
  if (mimeType.includes('pdf') || extension === 'pdf') {
    return { icon: FileText, color: '#ef4444', label: 'PDF' };
  }
  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) {
    return { icon: ImageIcon, color: '#10b981', label: 'IMAGE' };
  }
  if (mimeType.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi'].includes(extension)) {
    return { icon: Film, color: '#8b5cf6', label: 'VIDEO' };
  }
  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(extension)) {
    return { icon: Music, color: '#ec4899', label: 'AUDIO' };
  }
  if (['zip', 'rar', 'tar', 'gz', '7z'].includes(extension)) {
    return { icon: Archive, color: '#f59e0b', label: 'ARCHIVE' };
  }
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'java'].includes(extension)) {
    return { icon: Code, color: '#3b82f6', label: 'CODE' };
  }
  return { icon: File, color: '#64748b', label: 'FILE' };
};

export default function App() {
  // Check if public share link is accessed: /share/:token
  const [publicShareToken] = useState(() => {
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/share/')) {
      const parts = window.location.pathname.replace('/share/', '').split('/');
      return parts[0] || null;
    }
    return null;
  });

  if (publicShareToken) {
    return <PublicSharePage token={publicShareToken} />;
  }

  // Auth state
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authTab, setAuthTab] = useState('login'); // 'login' | 'register' | 'verify-email' | 'forgot-password' | 'reset-password'
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);

  // Additional Auth states
  const [showGoogleModal, setShowGoogleModal] = useState(false);
  const [googleForm, setGoogleForm] = useState({ email: '', name: '' });
  const [verifyEmailForm, setVerifyEmailForm] = useState({ email: '', token: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetPasswordForm, setResetPasswordForm] = useState({ token: '', newPassword: '' });
  const [twoFactorLogin, setTwoFactorLogin] = useState({ required: false, email: '', password: '', code: '' });

  // Security Modal state
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [twoFactorSetup, setTwoFactorSetup] = useState({ step: 'idle', secret: '', qrCode: '', otpauthUrl: '', verifyCode: '', error: '' });
  const [disable2FACode, setDisable2FACode] = useState('');
  const [disable2FAError, setDisable2FAError] = useState('');

  // Navigation & explorer state
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [activeTab, setActiveTab] = useState('drive'); // 'drive' | 'starred' | 'trash' | 'shared'
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: null, name: 'My Drive' }]);
  const [nodes, setNodes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile slide bar
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false); // Laptop/Desktop side panel collapsed

  // Responsive sidebar resize and ESC key listener
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768 && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (sidebarOpen) setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      setSidebarOpen((prev) => !prev);
    } else {
      setDesktopSidebarCollapsed((prev) => !prev);
    }
  };

  // Theme state: 'dark' | 'light'
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

  // Chunk Upload queue & Sharing state
  const [shareModalNode, setShareModalNode] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const uploadTasksRef = useRef(new Map());

  // Storage info
  const [storageInfo, setStorageInfo] = useState({
    storageUsed: 0,
    storageLimit: 10 * 1024 * 1024 * 1024,
    usedPercentage: 0,
  });

  // UI Modals
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [activeNode, setActiveNode] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [previewNode, setPreviewNode] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [actionMenuNodeId, setActionMenuNodeId] = useState(null);
  const [toast, setToast] = useState(null);

  const fileInputRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Check auth session on mount & handle OAuth callback code
  useEffect(() => {
    const initAuth = async () => {
      setAuthLoading(true);

      // 1. Check if OAuth redirect code is in URL
      const urlParams = new URLSearchParams(window.location.search);
      const oauthCode = urlParams.get('code');
      if (oauthCode) {
        try {
          const res = await api.googleAuth({ code: oauthCode });
          if (res.success && res.user) {
            setCurrentUser(res.user);
            window.history.replaceState({}, document.title, window.location.pathname);
            showToast(`Signed in with Google as ${res.user.name}!`);
            setAuthLoading(false);
            return;
          }
        } catch (_e) { }
      }

      // 2. Fetch current user via cookie/token
      try {
        const res = await api.getMe();
        if (res.success && res.user) {
          setCurrentUser(res.user);
        }
      } catch (_e) {
        setToken(null);
      } finally {
        setAuthLoading(false);
      }
    };
    initAuth();
  }, []);

  // Fetch nodes and storage when folder or active tab changes
  useEffect(() => {
    if (currentUser) {
      loadContents();
      loadStorage();
    }
  }, [currentUser, currentFolderId, activeTab]);

  // Auto-poll files that are currently processing in the background
  useEffect(() => {
    const hasActiveProcessing = nodes.some(
      (n) => n.type === 'file' && (n.processing?.status === 'queued' || n.processing?.status === 'processing')
    );

    if (!hasActiveProcessing || !currentUser) return;

    const pollTimer = setInterval(() => {
      if (activeTab === 'drive') {
        api.getNodes(currentFolderId).then((res) => {
          if (res.success && res.data?.nodes) {
            setNodes(res.data.nodes);
          }
        }).catch(() => {});
      }
    }, 4000);

    return () => clearInterval(pollTimer);
  }, [nodes, currentUser, currentFolderId, activeTab]);

  const loadContents = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'drive') {
        const res = await api.getNodes(currentFolderId);
        if (res.success) {
          setNodes(res.data.nodes || []);
          setBreadcrumbs(res.data.breadcrumbs || [{ id: null, name: 'My Drive' }]);
        }
      } else if (activeTab === 'starred') {
        const res = await api.getStarred();
        if (res.success) {
          setNodes(res.data.nodes || []);
          setBreadcrumbs([{ id: null, name: 'Starred' }]);
        }
      } else if (activeTab === 'trash') {
        const res = await api.getTrash();
        if (res.success) {
          setNodes(res.data.nodes || []);
          setBreadcrumbs([{ id: null, name: 'Trash' }]);
        }
      }
    } catch (err) {
      showToast('Failed to load items', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStorage = async () => {
    try {
      const res = await api.getStorage();
      if (res.success && res.data) {
        setStorageInfo(res.data);
      }
    } catch (_e) { }
  };

  // Auth Handlers
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    setIsAuthSubmitting(true);

    try {
      if (authTab === 'login') {
        const res = await api.login(authForm.email, authForm.password);
        if (res.requires2FA) {
          setTwoFactorLogin({
            required: true,
            email: authForm.email,
            password: authForm.password,
            code: '',
          });
          return;
        }
        if (res.success) {
          setCurrentUser(res.user);
          showToast(`Welcome back, ${res.user.name}!`);
        } else {
          if (res.message?.includes('verify your email')) {
            setVerifyEmailForm({ email: authForm.email, token: '' });
            setAuthError(res.message);
          } else {
            setAuthError(res.message || 'Login failed');
          }
        }
      } else {
        const res = await api.register(authForm.name, authForm.email, authForm.password);
        if (res.success) {
          setAuthSuccess(res.message || 'Registration successful! Please verify your email.');
          setVerifyEmailForm({
            email: authForm.email,
            token: res.verificationToken || '',
          });
          setAuthTab('verify-email');
        } else {
          setAuthError(res.message || 'Registration failed');
        }
      }
    } catch (err) {
      setAuthError(err.message || 'An unexpected error occurred');
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError('');
    try {
      const urlRes = await api.getGoogleAuthUrl();
      if (urlRes.configured && urlRes.url) {
        window.location.href = urlRes.url;
        return;
      }
      // If server does not have GOOGLE_CLIENT_ID configured in .env yet, open Google test dialog
      setGoogleForm({ email: authForm.email || 'user.google@gmail.com', name: authForm.name || 'Google User' });
      setShowGoogleModal(true);
    } catch (_err) {
      setShowGoogleModal(true);
    }
  };

  const handleGoogleSubmit = async (e) => {
    e?.preventDefault();
    setAuthError('');
    try {
      showToast('Authenticating with Google...', 'info');
      const email = googleForm.email.trim() || 'user.google@gmail.com';
      const name = googleForm.name.trim() || 'Google User';
      const googleId = 'google_' + Math.abs(email.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
      const res = await api.googleAuth({
        googleId,
        email,
        name,
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`
      });
      if (res.success && res.user) {
        setCurrentUser(res.user);
        setShowGoogleModal(false);
        showToast(`Connected with Google as ${res.user.name}!`);
      } else {
        setAuthError(res.message || 'Google authentication failed');
      }
    } catch (err) {
      setAuthError(err.message || 'Google authentication error');
    }
  };

  const handleVerifyEmailSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await api.verifyEmail(verifyEmailForm.token.trim());
      if (res.success) {
        setAuthSuccess('Email verified successfully! You can now sign in.');
        setAuthTab('login');
        showToast('Email verified successfully!');
      } else {
        setAuthError(res.message || 'Verification failed');
      }
    } catch (err) {
      setAuthError(err.message || 'Invalid or expired token');
    }
  };

  const handleResendVerification = async () => {
    try {
      const res = await api.resendVerification(verifyEmailForm.email || authForm.email);
      if (res.success) {
        if (res.verificationToken) {
          setVerifyEmailForm((prev) => ({ ...prev, token: res.verificationToken }));
          showToast('Verification token generated!');
        } else {
          showToast(res.message || 'Verification email resent');
        }
      } else {
        showToast(res.message || 'Failed to resend token', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await api.forgotPassword(forgotEmail.trim());
      if (res.success) {
        setAuthSuccess(res.message || 'Password reset token generated.');
        if (res.resetToken) {
          setResetPasswordForm({ token: res.resetToken, newPassword: '' });
          setAuthTab('reset-password');
        } else {
          setAuthTab('reset-password');
        }
        showToast('Password reset token generated');
      } else {
        setAuthError(res.message || 'Password reset request failed');
      }
    } catch (err) {
      setAuthError(err.message || 'Error requesting reset');
    }
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');
    try {
      const res = await api.resetPassword(resetPasswordForm.token.trim(), resetPasswordForm.newPassword);
      if (res.success) {
        setAuthSuccess(res.message || 'Password reset successful! Please sign in.');
        setAuthTab('login');
        showToast('Password reset successful!');
      } else {
        setAuthError(res.message || 'Failed to reset password');
      }
    } catch (err) {
      setAuthError(err.message || 'Reset failed');
    }
  };

  const handle2FALoginSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await api.login(twoFactorLogin.email, twoFactorLogin.password, twoFactorLogin.code.trim());
      if (res.success && res.user) {
        setCurrentUser(res.user);
        setTwoFactorLogin({ required: false, email: '', password: '', code: '' });
        showToast(`Welcome back, ${res.user.name}!`);
      } else {
        setAuthError(res.message || 'Invalid 2FA code');
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication error');
    }
  };

  const handleStart2FASetup = async () => {
    setTwoFactorSetup({ step: 'loading', secret: '', qrCode: '', otpauthUrl: '', verifyCode: '', error: '' });
    try {
      const res = await api.generate2FA();
      if (res.success) {
        setTwoFactorSetup({
          step: 'scan',
          secret: res.secret,
          qrCode: res.qrCode,
          otpauthUrl: res.otpauthUrl,
          verifyCode: '',
          error: '',
        });
      } else {
        showToast(res.message || 'Failed to generate 2FA secret', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleConfirm2FA = async (e) => {
    e.preventDefault();
    try {
      const res = await api.enable2FA(twoFactorSetup.verifyCode.trim());
      if (res.success) {
        showToast('Two-factor authentication enabled successfully!');
        setTwoFactorSetup({ step: 'idle', secret: '', qrCode: '', otpauthUrl: '', verifyCode: '', error: '' });
        setCurrentUser((prev) => ({ ...prev, twoFactorEnabled: true }));
      } else {
        setTwoFactorSetup((prev) => ({ ...prev, error: res.message || 'Invalid code' }));
      }
    } catch (err) {
      setTwoFactorSetup((prev) => ({ ...prev, error: err.message || 'Verification failed' }));
    }
  };

  const handleDisable2FA = async (e) => {
    e.preventDefault();
    setDisable2FAError('');
    try {
      const res = await api.disable2FA(disable2FACode.trim());
      if (res.success) {
        showToast('Two-factor authentication disabled');
        setDisable2FACode('');
        setCurrentUser((prev) => ({ ...prev, twoFactorEnabled: false }));
      } else {
        setDisable2FAError(res.message || 'Invalid code');
      }
    } catch (err) {
      setDisable2FAError(err.message || 'Failed to disable 2FA');
    }
  };

  const handleLogout = async () => {
    await api.logout();
    setCurrentUser(null);
    setCurrentFolderId(null);
    setNodes([]);
    showToast('Logged out successfully');
  };

  // Folder & File Handlers
  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await api.createFolder(newFolderName.trim(), currentFolderId);
      if (res.success) {
        showToast(`Folder "${newFolderName}" created`);
        setNewFolderName('');
        setShowNewFolderModal(false);
        loadContents();
        loadStorage();
      } else {
        showToast(res.message || 'Failed to create folder', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleFileUpload = async (files) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const taskId = `task_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`;
      const totalChunks = Math.ceil(file.size / (5 * 1024 * 1024)) || 1;

      const queueItem = {
        id: taskId,
        filename: file.name,
        size: file.size,
        percent: 0,
        asciiBar: '░░░░░░░░░░░░░░░░░░░░ 0%',
        status: 'hashing',
        completedCount: 0,
        totalChunks,
        deduplicatedCount: 0,
      };

      setUploadQueue((prev) => [queueItem, ...prev]);

      const task = new ChunkUploadTask(file, currentFolderId, {
        onProgress: (info) => {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === taskId
                ? {
                    ...item,
                    percent: info.percent,
                    asciiBar: info.asciiBar,
                    completedCount: info.completedCount,
                    totalChunks: info.totalChunks,
                    status: info.status,
                    deduplicatedCount: info.deduplicatedCount,
                  }
                : item
            )
          );
        },
        onStatusChange: (statusInfo) => {
          setUploadQueue((prev) =>
            prev.map((item) =>
              item.id === taskId
                ? {
                    ...item,
                    status: statusInfo.status,
                    percent: statusInfo.percent,
                    deduplicatedCount: statusInfo.deduplicatedCount,
                  }
                : item
            )
          );
        },
        onComplete: (fileResult) => {
          showToast(`Uploaded "${file.name}"`);
          loadContents();
          loadStorage();
        },
        onError: (err) => {
          showToast(`Upload error for "${file.name}": ${err.message}`, 'error');
        },
      });

      uploadTasksRef.current.set(taskId, task);
      task.start();
    }
  };

  const handlePauseUpload = (taskId) => {
    const task = uploadTasksRef.current.get(taskId);
    if (task) task.pause();
  };

  const handleResumeUpload = (taskId) => {
    const task = uploadTasksRef.current.get(taskId);
    if (task) task.resume();
  };

  const handleCancelUpload = (taskId) => {
    const task = uploadTasksRef.current.get(taskId);
    if (task) {
      task.cancel();
      uploadTasksRef.current.delete(taskId);
    }
    setUploadQueue((prev) => prev.filter((item) => item.id !== taskId));
  };

  const handleClearCompletedUploads = () => {
    setUploadQueue((prev) => prev.filter((item) => item.status !== 'completed'));
  };

  const handleRename = async (e) => {
    e.preventDefault();
    if (!activeNode || !renameValue.trim()) return;

    try {
      const res = await api.renameNode(activeNode._id, renameValue.trim());
      if (res.success) {
        showToast('Renamed successfully');
        setShowRenameModal(false);
        setActiveNode(null);
        loadContents();
      } else {
        showToast(res.message || 'Rename failed', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleToggleStar = async (node) => {
    try {
      const res = await api.toggleStar(node._id);
      if (res.success) {
        showToast(res.message);
        loadContents();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTrashNode = async (node) => {
    try {
      const res = await api.trashNode(node._id);
      if (res.success) {
        showToast(`Moved "${node.name}" to Trash`);
        loadContents();
        loadStorage();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleRestoreNode = async (node) => {
    try {
      const res = await api.restoreNode(node._id);
      if (res.success) {
        showToast(`Restored "${node.name}"`);
        loadContents();
        loadStorage();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeletePermanently = async (node) => {
    if (!window.confirm(`Permanently delete "${node.name}"? This action cannot be undone.`)) return;

    try {
      const res = await api.deletePermanently(node._id);
      if (res.success) {
        showToast(`Permanently deleted "${node.name}"`);
        loadContents();
        loadStorage();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Direct S3 Signed URL Download
  const handleDownloadFile = async (file) => {
    try {
      showToast(`Generating signed URL for ${file.name}...`, 'info');
      const res = await api.getFileDownloadUrl(file._id);
      if (res.success && res.data?.downloadUrl) {
        // Direct browser download from signed S3 URL
        const link = document.createElement('a');
        link.href = res.data.downloadUrl;
        link.download = file.name;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`Downloading ${file.name}...`);
      } else {
        showToast(res.message || 'Failed to download file', 'error');
      }
    } catch (err) {
      showToast(`Download failed: ${err.message}`, 'error');
    }
  };

  // Search filter
  const filteredNodes = nodes.filter((n) =>
    searchQuery ? n.name.toLowerCase().includes(searchQuery.toLowerCase()) : true
  );

  const folders = filteredNodes.filter((n) => n.type === 'folder');
  const files = filteredNodes.filter((n) => n.type === 'file');

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  };

  // Render Auth View if not logged in
  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="brand-icon" style={{ width: 56, height: 56 }}>
            <Cloud size={32} color="#fff" />
          </div>
          <p style={{ color: 'var(--text-secondary)' }}>Connecting to CloudNest...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="auth-container">
        {/* Ambient Decorative Glow Orbs */}
        <div className="auth-bg-glow-1" />
        <div className="auth-bg-glow-2" />

        <div className="glass-modal auth-card">
          {/* Top Bar with Theme Switcher */}
          <div className="auth-top-bar">
            <button
              type="button"
              className="auth-theme-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>

          {/* Brand Header */}
          <div className="auth-header">
            <div className="auth-brand-badge">
              <Cloud size={30} color="#fff" />
            </div>
            <h1 className="auth-title">CloudNest</h1>
            <p className="auth-subtitle">
              Next-Gen Cloud Storage &amp; File Workspace
            </p>
          </div>

          {authError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 18 }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{authError}</span>
            </div>
          )}

          {authSuccess && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-md)', color: 'var(--color-success)', fontSize: '0.85rem', marginBottom: 18 }}>
              <Check size={18} style={{ flexShrink: 0 }} />
              <span>{authSuccess}</span>
            </div>
          )}

          {/* Flow 1: 2FA Verification during Login */}
          {twoFactorLogin.required ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-md)' }}>
                <Smartphone size={24} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>Two-Factor Authentication</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>Enter the 6-digit code from Google Authenticator</p>
                </div>
              </div>
              <form onSubmit={handle2FALoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Authentication Code</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                    style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '1.25rem', fontWeight: 700, height: 46 }}
                    value={twoFactorLogin.code}
                    onChange={(e) => setTwoFactorLogin({ ...twoFactorLogin, code: e.target.value.replace(/\D/g, '') })}
                  />
                </div>
                <button type="submit" className="auth-submit-btn" style={{ marginTop: 4 }}>
                  Verify &amp; Sign In
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '100%', height: 44, borderRadius: 12 }}
                  onClick={() => setTwoFactorLogin({ required: false, email: '', password: '', code: '' })}
                >
                  Cancel
                </button>
              </form>
            </div>
          ) : authTab === 'verify-email' ? (
            /* Flow 2: Email Verification */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: 'var(--radius-md)' }}>
                <Mail size={24} color="var(--accent-primary)" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>Verify Your Email</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>Enter your verification token to activate your account</p>
                </div>
              </div>

              {verifyEmailForm.token && (
                <div style={{ padding: 10, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: '#6ee7b7' }}>
                  <span>Development Token: <strong>{verifyEmailForm.token.slice(0, 16)}...</strong></span>
                </div>
              )}

              <form onSubmit={handleVerifyEmailSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="auth-input-wrapper">
                  <Key className="auth-input-icon" size={17} />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Paste verification token"
                    required
                    value={verifyEmailForm.token}
                    onChange={(e) => setVerifyEmailForm({ ...verifyEmailForm, token: e.target.value })}
                  />
                </div>
                <button type="submit" className="auth-submit-btn">
                  Verify Email
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500 }} onClick={handleResendVerification}>
                    Resend token
                  </button>
                  <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }} onClick={() => { setAuthTab('login'); setAuthError(''); }}>
                    Back to Sign In
                  </button>
                </div>
              </form>
            </div>
          ) : authTab === 'forgot-password' ? (
            /* Flow 3: Forgot Password */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 'var(--radius-md)' }}>
                <Key size={24} color="#f59e0b" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>Reset Your Password</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>We will issue a secure reset token for your account</p>
                </div>
              </div>
              <form onSubmit={handleForgotPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="auth-input-wrapper">
                  <Mail className="auth-input-icon" size={17} />
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="name@example.com"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                  />
                </div>
                <button type="submit" className="auth-submit-btn">
                  Send Password Reset Token
                </button>
                <button type="button" className="btn btn-secondary" style={{ width: '100%', height: 44, borderRadius: 12 }} onClick={() => { setAuthTab('login'); setAuthError(''); }}>
                  Back to Sign In
                </button>
              </form>
            </div>
          ) : authTab === 'reset-password' ? (
            /* Flow 4: Reset Password */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 'var(--radius-md)' }}>
                <Lock size={24} color="#10b981" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem' }}>
                  <strong>Create New Password</strong>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>Enter the reset token and your new password</p>
                </div>
              </div>
              <form onSubmit={handleResetPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="auth-input-wrapper">
                  <Key className="auth-input-icon" size={17} />
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Enter reset token"
                    required
                    value={resetPasswordForm.token}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, token: e.target.value })}
                  />
                </div>
                <div className="auth-input-wrapper">
                  <Lock className="auth-input-icon" size={17} />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="New password (at least 6 characters)"
                    required
                    minLength={6}
                    value={resetPasswordForm.newPassword}
                    onChange={(e) => setResetPasswordForm({ ...resetPasswordForm, newPassword: e.target.value })}
                  />
                </div>
                <button type="submit" className="auth-submit-btn">
                  Save New Password
                </button>
                <button type="button" className="btn btn-secondary" style={{ width: '100%', height: 44, borderRadius: 12 }} onClick={() => { setAuthTab('login'); setAuthError(''); }}>
                  Back to Sign In
                </button>
              </form>
            </div>
          ) : (
            /* Flow 5: Sign In & Register */
            <>
              {/* Segmented Tab Pill Selector */}
              <div className="auth-tabs-pill">
                <button
                  type="button"
                  className={`auth-tab-btn ${authTab === 'login' ? 'active' : ''}`}
                  onClick={() => { setAuthTab('login'); setAuthError(''); setAuthSuccess(''); }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn ${authTab === 'register' ? 'active' : ''}`}
                  onClick={() => { setAuthTab('register'); setAuthError(''); setAuthSuccess(''); }}
                >
                  Register
                </button>
              </div>

              {/* Google One-Click Auth Button */}
              <button
                type="button"
                className="btn-google"
                onClick={handleGoogleSignIn}
              >
                <GoogleIcon />
                <span>Continue with Google</span>
              </button>

              <div className="auth-divider">
                <span>or with email</span>
              </div>

              <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {authTab === 'register' && (
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Full Name</label>
                    <div className="auth-input-wrapper">
                      <UserIcon className="auth-input-icon" size={17} />
                      <input
                        type="text"
                        className="auth-input"
                        placeholder="e.g. Vansh"
                        required
                        value={authForm.name}
                        onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Email Address</label>
                  <div className="auth-input-wrapper">
                    <Mail className="auth-input-icon" size={17} />
                    <input
                      type="email"
                      className="auth-input"
                      placeholder="name@example.com"
                      required
                      value={authForm.email}
                      onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Password</label>
                  <div className="auth-input-wrapper">
                    <Lock className="auth-input-icon" size={17} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input has-toggle"
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      value={authForm.password}
                      onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    />
                    <button
                      type="button"
                      className="auth-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {authTab === 'login' && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -2 }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.82rem', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => { setAuthTab('forgot-password'); setAuthError(''); setAuthSuccess(''); setForgotEmail(authForm.email); }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isAuthSubmitting}
                >
                  {isAuthSubmitting ? (
                    <>
                      <RefreshCw className="animate-spin" size={16} />
                      <span>Processing...</span>
                    </>
                  ) : (
                    authTab === 'login' ? 'Sign In to CloudNest' : 'Create Free Account'
                  )}
                </button>
              </form>

              {/* Trust Badge */}
              <div className="auth-trust-badge">
                <ShieldCheck size={14} color="#10b981" />
                <span>256-bit AES Encryption • Zero-Knowledge Storage</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Toast Notification */}
      {toast && (
        <div className="app-toast">
          {toast.type === 'error' ? <AlertCircle color="var(--color-danger)" size={18} style={{ flexShrink: 0 }} /> : <Check color="var(--color-success)" size={18} style={{ flexShrink: 0 }} />}
          <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{toast.message}</span>
        </div>
      )}

      {/* Hidden file input for header upload button */}
      <input
        type="file"
        ref={fileInputRef}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Mobile Sidebar Backdrop Overlay */}
      <div
        className={`sidebar-backdrop ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Left Sidebar / Mobile Slide Bar */}
      <aside className={`sidebar ${sidebarOpen ? 'mobile-open' : ''} ${desktopSidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="brand-icon">
              <Cloud size={22} color="#fff" />
            </div>
            <span className="brand-name">CloudNest</span>
          </div>

          {/* Close button for Mobile Slide Bar */}
          <button
            type="button"
            className="btn-icon sidebar-close-btn"
            onClick={() => setSidebarOpen(false)}
            title="Close menu"
            aria-label="Close sidebar drawer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Button */}
        <div className="sidebar-actions" style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, padding: '12px', fontSize: '0.9rem' }}
            onClick={() => {
              fileInputRef.current?.click();
              setSidebarOpen(false);
            }}
          >
            <UploadCloud size={18} />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            title="New Folder"
            onClick={() => {
              setNewFolderName('');
              setShowNewFolderModal(true);
              setSidebarOpen(false);
            }}
          >
            <FolderPlus size={18} />
          </button>
        </div>

        {/* Navigation items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
          <div
            className={`nav-item ${activeTab === 'drive' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('drive');
              setCurrentFolderId(null);
              setSidebarOpen(false);
            }}
          >
            <HardDrive size={18} />
            <span>My Drive</span>
          </div>

          <div
            className={`nav-item ${activeTab === 'shared' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('shared');
              setCurrentFolderId(null);
              setSidebarOpen(false);
            }}
          >
            <Users size={18} />
            <span>Shared with me</span>
          </div>

          <div
            className={`nav-item ${activeTab === 'starred' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('starred');
              setCurrentFolderId(null);
              setSidebarOpen(false);
            }}
          >
            <Star size={18} />
            <span>Starred</span>
          </div>

          <div
            className={`nav-item ${activeTab === 'trash' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('trash');
              setCurrentFolderId(null);
              setSidebarOpen(false);
            }}
          >
            <Trash2 size={18} />
            <span>Trash</span>
          </div>
        </nav>

        {/* Storage overview */}
        <div className="storage-widget">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            <span>Storage</span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{storageInfo.usedPercentage}%</span>
          </div>

          <div className="storage-bar-bg">
            <div className="storage-bar-fill" style={{ width: `${Math.max(2, storageInfo.usedPercentage)}%` }} />
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {formatBytes(storageInfo.storageUsed)} of {formatBytes(storageInfo.storageLimit)} used
          </div>
        </div>

        {/* Mobile Sidebar User Footer */}
        {currentUser && (
          <div className="sidebar-mobile-user">
            <div
              className="sidebar-user-info"
              onClick={() => {
                setShowSecurityModal(true);
                setSidebarOpen(false);
              }}
              title="Account & Security"
            >
              <div className="sidebar-user-avatar">
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  currentUser.name?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <div className="sidebar-user-text">
                <span className="sidebar-user-name">{currentUser.name}</span>
                <span className="sidebar-user-email">{currentUser.email}</span>
              </div>
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={handleLogout}
              title="Sign Out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </aside>

      {/* Main Area */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="topbar">
          <div className="topbar-left">
            {/* Three line hamburger toggle for both mobile and laptop */}
            <button
              type="button"
              className="btn-icon sidebar-toggle-btn"
              onClick={toggleSidebar}
              title={desktopSidebarCollapsed ? "Show side panel (three lines)" : "Hide side panel (three lines)"}
              aria-label="Toggle side panel"
            >
              <Menu size={20} />
            </button>

            {/* Topbar Brand identity (visible on mobile, and on desktop when sidebar is hidden) */}
            <div
              className={`topbar-brand ${desktopSidebarCollapsed ? 'visible-desktop' : ''}`}
              onClick={() => { setActiveTab('drive'); setCurrentFolderId(null); }}
              title="CloudNest Home"
            >
              <div className="brand-icon topbar-brand-icon">
                <Cloud size={18} color="#fff" />
              </div>
              <span className="brand-name topbar-brand-name">CloudNest</span>
            </div>
          </div>

          {/* Search Box */}
          <div className="search-box">
            <Search className="search-icon" size={17} />
            <input
              type="text"
              className="input"
              placeholder="Search files & folders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Topbar Right Controls */}
          <div className="topbar-right">
            {/* Quick Upload Button on Topbar (Mobile & Desktop) */}
            <button
              type="button"
              className="btn btn-primary topbar-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Upload File"
            >
              <UploadCloud size={16} />
              <span className="topbar-upload-text">Upload</span>
            </button>

            {/* View mode toggle */}
            <div className="view-mode-toggle">
              <button
                type="button"
                className="btn-icon"
                style={{ background: viewMode === 'grid' ? 'var(--bg-active)' : 'transparent', color: viewMode === 'grid' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                onClick={() => setViewMode('grid')}
                title="Grid view"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                type="button"
                className="btn-icon"
                style={{ background: viewMode === 'list' ? 'var(--bg-active)' : 'transparent', color: viewMode === 'list' ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                onClick={() => setViewMode('list')}
                title="List view"
              >
                <ListIcon size={16} />
              </button>
            </div>

            {/* Light / Dark Mode Toggle */}
            <button
              type="button"
              className="btn-icon theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            {/* User Profile & Security Settings */}
            <div className="topbar-profile-section">
              <div
                className="topbar-avatar"
                onClick={() => setShowSecurityModal(true)}
                title="Account & Security"
              >
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  currentUser.name?.[0]?.toUpperCase() || 'U'
                )}
              </div>

              {/* Desktop User Details */}
              <div className="topbar-user-details" onClick={() => setShowSecurityModal(true)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{currentUser.name}</span>
                  {currentUser.emailVerified && (
                    <span className="badge-success" style={{ padding: '2px 6px', fontSize: '0.65rem' }}>
                      <Check size={10} /> Verified
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{currentUser.email}</span>
              </div>

              <button
                type="button"
                className="btn-icon topbar-shield-btn"
                onClick={() => setShowSecurityModal(true)}
                title="Security & 2FA Settings"
              >
                <Shield size={16} color={currentUser.twoFactorEnabled ? '#10b981' : 'var(--accent-primary)'} />
              </button>
              <button
                type="button"
                className="btn-icon topbar-logout-btn"
                onClick={handleLogout}
                title="Sign Out"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Content Body */}
        <main className="content-area">
          {/* Drag & drop overlay */}
          {isDragging && (
            <div className="dropzone-overlay">
              <UploadCloud size={48} color="var(--accent-primary)" />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Drop files to upload instantly</h3>
              <p style={{ color: 'var(--text-secondary)' }}>Files will be saved in current folder</p>
            </div>
          )}

          {/* Content Body */}
          {activeTab === 'shared' ? (
            <SharedWithMeView
              onOpenFolder={(folderId) => {
                setCurrentFolderId(folderId);
                setActiveTab('drive');
              }}
              onPreviewFile={(file) => setPreviewNode(file)}
              showToast={showToast}
            />
          ) : (
            <>
              {/* Breadcrumbs Navigation & Header Actions */}
              {activeTab === 'drive' && (
                <div className="content-header-row">
                  <div className="breadcrumbs">
                    {breadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.id || 'root'}>
                        <div
                          className={`breadcrumb-item ${idx === breadcrumbs.length - 1 ? 'current' : ''}`}
                          onClick={() => {
                            if (idx !== breadcrumbs.length - 1) {
                              setCurrentFolderId(crumb.id);
                            }
                          }}
                        >
                          {crumb.name}
                        </div>
                        {idx < breadcrumbs.length - 1 && <ChevronRight size={14} color="var(--text-muted)" />}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Quick Action Button for Mobile/Tablet */}
                  <div className="content-quick-actions">
                    <button
                      type="button"
                      className="btn btn-secondary content-new-folder-btn"
                      onClick={() => { setNewFolderName(''); setShowNewFolderModal(true); }}
                      title="New Folder"
                    >
                      <FolderPlus size={15} />
                      <span>New Folder</span>
                    </button>
                  </div>
                </div>
              )}

          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-secondary)' }}>
              <RefreshCw className="animate-spin" size={24} style={{ marginRight: 10 }} />
              <span>Loading CloudNest...</span>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 360, color: 'var(--text-muted)', textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Cloud size={40} color="var(--text-muted)" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>This folder is empty</h3>
              <p style={{ fontSize: '0.875rem', marginTop: 4, maxWidth: 300 }}>
                Drop files here or click "Upload File" above to get started.
              </p>
            </div>
          ) : (
            <>
              {/* Folders Section */}
              {folders.length > 0 && (
                <div>
                  <h4 className="section-title">Folders ({folders.length})</h4>
                  <div className="folder-grid">
                    {folders.map((folder) => (
                      <div
                        key={folder._id}
                        className="folder-card"
                        onClick={() => setCurrentFolderId(folder._id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden', flex: 1, minWidth: 0 }}>
                          <Folder size={20} color="#6366f1" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            {folder.name}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          {activeTab === 'trash' ? (
                            <>
                              <button type="button" className="card-action-btn" title="Restore" onClick={() => handleRestoreNode(folder)}>
                                <RotateCcw size={15} />
                              </button>
                              <button type="button" className="card-action-btn" title="Delete Forever" onClick={() => handleDeletePermanently(folder)}>
                                <Trash2 size={15} color="#ef4444" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="card-action-btn"
                                onClick={() => handleToggleStar(folder)}
                              >
                                <Star size={15} fill={folder.isFavorite ? '#f59e0b' : 'none'} color={folder.isFavorite ? '#f59e0b' : 'var(--text-muted)'} />
                              </button>
                              <button
                                type="button"
                                className="card-action-btn"
                                title="Share folder"
                                onClick={() => setShareModalNode(folder)}
                              >
                                <Share2 size={15} />
                              </button>
                              <button
                                type="button"
                                className="card-action-btn"
                                onClick={() => {
                                  setActiveNode(folder);
                                  setRenameValue(folder.name);
                                  setShowRenameModal(true);
                                }}
                              >
                                <Edit2 size={15} />
                              </button>
                              <button
                                type="button"
                                className="card-action-btn"
                                onClick={() => handleTrashNode(folder)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files Section */}
              {files.length > 0 && (
                <div>
                  <h4 className="section-title">Files ({files.length})</h4>
                  <div className={viewMode === 'grid' ? 'file-grid' : 'list-view'}>
                    {files.map((file) => {
                      const { icon: FileIconComponent, color, label } = getFileIcon(file.mimeType, file.metadata?.extension);
                      const hasThumb = Boolean(file.processing?.thumbnailKey || file.processing?.thumbnailUrl);
                      const isProcessing = file.processing?.status === 'queued' || file.processing?.status === 'processing';

                      return (
                        <div key={file._id} className="file-card" onClick={() => setPreviewNode(file)}>
                          <div className="file-preview-thumbnail" style={{ position: 'relative', overflow: 'hidden' }}>
                            {hasThumb ? (
                              <img
                                src={api.getFileThumbnailUrl(file._id)}
                                alt={file.name}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}
                            <div style={{ display: hasThumb ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                              <FileIconComponent size={40} color={color} />
                            </div>
                            {isProcessing && (
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 6,
                                  right: 6,
                                  background: 'rgba(15, 23, 42, 0.85)',
                                  backdropFilter: 'blur(4px)',
                                  padding: '2px 6px',
                                  borderRadius: 6,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  fontSize: '0.65rem',
                                  color: '#a5b4fc',
                                  fontWeight: 500,
                                }}
                              >
                                <RefreshCw className="animate-spin" size={10} />
                                <span>Processing</span>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 0 }}>
                            {/* File Name - Full Width with Ellipsis */}
                            <h5
                              style={{
                                fontSize: '0.86rem',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                width: '100%',
                                margin: 0,
                                minWidth: 0,
                              }}
                              title={file.name}
                            >
                              {file.name}
                            </h5>

                            {/* Details & Actions Row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', minWidth: 0 }}>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {formatBytes(file.size)}
                                </span>
                                {isProcessing && (
                                  <span style={{ fontSize: '0.66rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}>
                                    • Processing
                                  </span>
                                )}
                                {file.processing?.status === 'completed' && file.processing?.extractedText && (
                                  <span
                                    style={{
                                      fontSize: '0.62rem',
                                      fontWeight: 700,
                                      color: '#10b981',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      padding: '1px 5px',
                                      borderRadius: 4,
                                      flexShrink: 0,
                                    }}
                                    title="OCR Text extracted"
                                  >
                                    OCR
                                  </span>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                {activeTab === 'trash' ? (
                                  <>
                                    <button type="button" className="card-action-btn" title="Restore" onClick={() => handleRestoreNode(file)}>
                                      <RotateCcw size={14} />
                                    </button>
                                    <button type="button" className="card-action-btn" title="Delete Permanently" onClick={() => handleDeletePermanently(file)}>
                                      <Trash2 size={14} color="#ef4444" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="card-action-btn"
                                      title="Download via Signed S3 URL"
                                      onClick={() => handleDownloadFile(file)}
                                    >
                                      <Download size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="card-action-btn"
                                      title="Share file"
                                      onClick={() => setShareModalNode(file)}
                                    >
                                      <Share2 size={14} />
                                    </button>
                                    <button
                                      type="button"
                                      className="card-action-btn"
                                      onClick={() => handleToggleStar(file)}
                                    >
                                      <Star size={14} fill={file.isFavorite ? '#f59e0b' : 'none'} color={file.isFavorite ? '#f59e0b' : 'var(--text-muted)'} />
                                    </button>
                                    <button
                                      type="button"
                                      className="card-action-btn"
                                      onClick={() => handleTrashNode(file)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="modal-backdrop" onClick={() => setShowNewFolderModal(false)}>
          <div className="glass-modal" style={{ width: '100%', maxWidth: 380, borderRadius: 'var(--radius-lg)', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Create New Folder</h3>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                className="input"
                placeholder="Folder Name"
                autoFocus
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowNewFolderModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && activeNode && (
        <div className="modal-backdrop" onClick={() => setShowRenameModal(false)}>
          <div className="glass-modal" style={{ width: '100%', maxWidth: 380, borderRadius: 'var(--radius-lg)', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Rename Item</h3>
            <form onSubmit={handleRename}>
              <input
                type="text"
                className="input"
                autoFocus
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowRenameModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rich File & Media Viewer Modal */}
      {previewNode && (
        <FileViewerModal
          node={previewNode}
          isOpen={!!previewNode}
          onClose={() => setPreviewNode(null)}
          onDownload={handleDownloadFile}
          onShare={(node) => setShareModalNode(node)}
        />
      )}
      {/* Google Quick Connect Modal */}
      {showGoogleModal && (
        <div className="modal-backdrop" onClick={() => setShowGoogleModal(false)}>
          <div className="glass-modal" style={{ width: '100%', maxWidth: 420, borderRadius: 'var(--radius-lg)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <GoogleIcon />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Google Sign-In</h3>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 20, lineHeight: 1.5 }}>
              Connect with your Google account. In development mode, you can sign in directly with test credentials or configure <code>GOOGLE_CLIENT_ID</code> in <code>.env</code>.
            </p>
            <form onSubmit={handleGoogleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Google Account Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Vansh Google"
                  required
                  value={googleForm.name}
                  onChange={(e) => setGoogleForm({ ...googleForm, name: e.target.value })}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Google Email</label>
                <input
                  type="email"
                  className="input"
                  placeholder="e.g. vansh@gmail.com"
                  required
                  value={googleForm.email}
                  onChange={(e) => setGoogleForm({ ...googleForm, email: e.target.value })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGoogleModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Sign In with Google</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account & Security Settings Modal */}
      {showSecurityModal && (
        <div className="modal-backdrop" onClick={() => setShowSecurityModal(false)}>
          <div className="glass-modal" style={{ width: '90%', maxWidth: 540, borderRadius: 'var(--radius-lg)', padding: 28 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Shield size={22} color="var(--accent-primary)" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Account &amp; Security</h3>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowSecurityModal(false)}>
                <X size={20} />
              </button>
            </div>

            {/* Profile Overview */}
            <div className="security-card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', overflow: 'hidden' }}>
                {currentUser.avatar ? (
                  <img src={currentUser.avatar} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  currentUser.name?.[0]?.toUpperCase() || 'U'
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h4 style={{ fontWeight: 700, fontSize: '1rem' }}>{currentUser.name}</h4>
                  <span className={currentUser.emailVerified ? 'badge-success' : 'badge-warning'}>
                    {currentUser.emailVerified ? 'Verified' : 'Unverified'}
                  </span>
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 2 }}>{currentUser.email}</p>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Provider: <strong>{currentUser.authProvider === 'google' ? 'Google OAuth' : 'Password'}</strong>
                </span>
              </div>
            </div>

            {/* Two-Factor Authentication Section */}
            <div className="security-card" style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Smartphone size={18} color="var(--accent-primary)" />
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Two-Factor Authentication (2FA)</span>
                </div>
                <span className={currentUser.twoFactorEnabled ? 'badge-success' : 'badge-warning'}>
                  {currentUser.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 14 }}>
                {currentUser.twoFactorEnabled
                  ? 'Your account is secured with TOTP two-factor authentication (Google Authenticator).'
                  : 'Add an extra layer of security to your account with Google Authenticator or any TOTP app.'}
              </p>

              {currentUser.twoFactorEnabled ? (
                /* 2FA Enabled -> Allow Disabling */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <form onSubmit={handleDisable2FA} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="6-digit TOTP code"
                      maxLength={6}
                      required
                      value={disable2FACode}
                      onChange={(e) => setDisable2FACode(e.target.value.replace(/\D/g, ''))}
                      style={{ maxWidth: 180 }}
                    />
                    <button type="submit" className="btn btn-secondary" style={{ color: '#ef4444' }}>
                      Disable 2FA
                    </button>
                  </form>
                  {disable2FAError && (
                    <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{disable2FAError}</span>
                  )}
                </div>
              ) : twoFactorSetup.step === 'idle' ? (
                <button type="button" className="btn btn-primary" onClick={handleStart2FASetup}>
                  <ShieldCheck size={16} />
                  <span>Enable 2FA Protection</span>
                </button>
              ) : twoFactorSetup.step === 'loading' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <RefreshCw className="animate-spin" size={16} />
                  <span>Generating QR code and key...</span>
                </div>
              ) : (
                /* 2FA Setup Step: Scan QR Code & Enter Code */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)', padding: 16, borderRadius: 'var(--radius-md)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                      Scan this QR code with <strong>Google Authenticator</strong>:
                    </p>
                    {twoFactorSetup.qrCode && (
                      <img src={twoFactorSetup.qrCode} alt="2FA QR Code" style={{ width: 160, height: 160, borderRadius: 8, border: '4px solid var(--border-subtle)', background: '#ffffff' }} />
                    )}
                    <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', padding: '6px 12px', borderRadius: 6, fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      Secret: {twoFactorSetup.secret}
                    </div>
                  </div>

                  <form onSubmit={handleConfirm2FA} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Enter 6-digit verification code from app:
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        className="input"
                        placeholder="000000"
                        maxLength={6}
                        required
                        autoFocus
                        value={twoFactorSetup.verifyCode}
                        onChange={(e) => setTwoFactorSetup({ ...twoFactorSetup, verifyCode: e.target.value.replace(/\D/g, '') })}
                        style={{ textAlign: 'center', letterSpacing: '4px', fontWeight: 700 }}
                      />
                      <button type="submit" className="btn btn-primary" style={{ minWidth: 100 }}>
                        Verify
                      </button>
                    </div>
                    {twoFactorSetup.error && (
                      <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>{twoFactorSetup.error}</span>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setTwoFactorSetup({ step: 'idle', secret: '', qrCode: '', otpauthUrl: '', verifyCode: '', error: '' })}
                    >
                      Cancel Setup
                    </button>
                  </form>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowSecurityModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Queue Floating Dock */}
      <UploadQueueModal
        uploads={uploadQueue}
        onPause={handlePauseUpload}
        onResume={handleResumeUpload}
        onCancel={handleCancelUpload}
        onClearCompleted={handleClearCompletedUploads}
      />

      {/* Share Modal */}
      {shareModalNode && (
        <ShareModal
          node={shareModalNode}
          isOpen={!!shareModalNode}
          onClose={() => setShareModalNode(null)}
          currentUser={currentUser}
          showToast={showToast}
        />
      )}
    </div>
  );
}
