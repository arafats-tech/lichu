import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcrypt';

dotenv.config();

// FreeDB.tech Database Configuration
export const db = mysql.createPool({
  host: process.env.DB_HOST || 'sql.freedb.tech',
  user: process.env.DB_USER || 'freedb_lichu-arafatstech',
  password: process.env.DB_PASSWORD || '*C?%f2V48fDwERT',
  database: process.env.DB_NAME || 'freedb_lichu-arafatstech',
  port: process.env.DB_PORT || 3306,
  
  // IMPORTANT: FreeDB.tech requires SSL disabled
  ssl: false,
  
  // Connection pool settings
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  connectTimeout: 10000,
  acquireTimeout: 10000,
  
  // MySQL settings
  charset: 'utf8mb4',
  timezone: '+06:00',
  dateStrings: true
});

// Test database connection on startup
export const testDBConnection = async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Database connected to FreeDB.tech');
    
    // Check if tables exist
    const [tables] = await connection.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = ?
    `, [process.env.DB_NAME || 'freedb_lichu-arafatstech']);
    
    console.log('📊 Existing tables:', tables.map(t => t.TABLE_NAME));
    
    // Create tables if they don't exist
    if (tables.length === 0) {
      console.log('🛠️ Creating database tables...');
      await createTables(connection);
    }
    
    connection.release();
    return { success: true, tables: tables.length };
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.error('🔧 Config:', {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      database: process.env.DB_NAME,
      errorCode: error.code
    });
    return { success: false, error: error.message };
  }
};

// Create necessary tables
const createTables = async (connection) => {
  try {
    // Posts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        image_data LONGTEXT,
        video_url VARCHAR(500),
        slug VARCHAR(255) UNIQUE,
        published BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_slug (slug),
        INDEX idx_created (created_at)
      )
    `);
    
    // Users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'editor') DEFAULT 'editor',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_username (username)
      )
    `);
    
    // Insert default admin user if not exists
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    await connection.query(`
      INSERT IGNORE INTO users (username, password_hash, role) 
      VALUES (?, ?, 'admin')
    `, [process.env.ADMIN_USERNAME || 'admin', hashedPassword]);
    
    console.log('✅ Tables created successfully');
    return true;
  } catch (error) {
    console.error('❌ Table creation error:', error.message);
    return false;
  }
};

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
  console.error('🔥 Error:', err.stack);
  
  // Database connection error
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return res.status(500).render('error', {
      title: 'Database Error',
      message: 'Could not connect to database. Please check your connection.',
      error: process.env.NODE_ENV === 'development' ? err : {}
    });
  }
  
  // Generic error
  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

// Hash password
export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 10);
};

// Compare password
export const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Initialize database on import
testDBConnection().then(result => {
  if (result.success) {
    console.log('🎉 Database initialization complete');
  } else {
    console.log('⚠️ Database initialization failed:', result.error);
  }
});
