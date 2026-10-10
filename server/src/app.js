import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import authRoutes from './routes/authRoutes.js';
import nodeRoutes from './routes/nodeRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import shareRoutes from './routes/shareRoutes.js';

const app = express();

// Security and utility middlewares
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Health check endpoints
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'CloudNest API is running',
  });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'cloudnest-api',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/nodes', nodeRoutes);
app.use('/api/files', nodeRoutes);
app.use('/files', nodeRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/uploads', uploadRoutes);
app.use('/api/shares', shareRoutes);
app.use('/shares', shareRoutes);

// 404 Not Found Handler
app.use((req, res, _next) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((err, _req, res, _next) => {
  const statusCode = err.statusCode || (err instanceof ZodError ? 400 : 500);

  if (statusCode >= 500) {
    console.error('[Server Error]', err);
  } else {
    console.warn(`[Client ${statusCode}] ${err.message}`);
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle Mongoose duplicate key error (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return res.status(409).json({
      success: false,
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
    });
  }

  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && { stack: err.stack }),
  });
});

export default app;
