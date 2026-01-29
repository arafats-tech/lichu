import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { S3Client } from '@aws-sdk/client-s3'; // Optional for cloud storage

dotenv.config();

// Database connection pool
export const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Authentication middleware
export const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Sanitize title for URLs
export const sanitizeTitle = (title) => {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
};

// Error handler
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong!';
  
  // If it's an API request, return JSON
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(statusCode).json({
      error: {
        message,
        status: statusCode,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      }
    });
  }
  
  // Otherwise render error page
  res.status(statusCode).render('error', {
    title: 'Error',
    message,
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

// Hash password (if needed)
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Compare password (if needed)
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Optional: S3 Client for cloud storage (remove if not using)
export const s3Client = process.env.AWS_ACCESS_KEY_ID ? new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
}) : null;
