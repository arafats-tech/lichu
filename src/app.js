import express from 'express';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import session from 'express-session';
import { slugify } from 'slugify';

// Import utilities
import { 
  db, 
  isAuthenticated, 
  sanitizeTitle, 
  errorHandler,
  comparePassword,
  testDBConnection 
} from './utils/index.js';

// Initialize Express
const app = express();

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'lichu-app-secret-key-123',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// File upload configuration (memory storage for Vercel)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const isValid = allowedTypes.test(file.mimetype);
    cb(null, isValid);
  }
});

// ==================== TEST ROUTES ====================
app.get('/', async (req, res) => {
  try {
    const [posts] = await db.query(`
      SELECT * FROM posts 
      WHERE published = 1 
      ORDER BY created_at DESC 
      LIMIT 5
    `);
    
    res.render('index', {
      title: 'Lichu App - Home',
      posts,
      user: req.session.user
    });
  } catch (error) {
    res.render('index', {
      title: 'Lichu App - Home',
      posts: [],
      user: req.session.user,
      error: 'Could not load posts'
    });
  }
});

// Health check (no database)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'lichu-app',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.1'
  });
});

// Database test endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const [result] = await db.query('SELECT NOW() as db_time, 1+1 as calculation');
    
    res.json({
      success: true,
      message: '✅ Database connected successfully!',
      database: process.env.DB_NAME,
      result: result[0],
      connection: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        ssl: 'disabled'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      config: {
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        database: process.env.DB_NAME
      }
    });
  }
});

// Environment check
app.get('/api/env-check', (req, res) => {
  res.json({
    app: 'Lichu',
    env: {
      node_env: process.env.NODE_ENV,
      db_host: process.env.DB_HOST ? '✓ Set' : '✗ Missing',
      db_user: process.env.DB_USER ? '✓ Set' : '✗ Missing',
      db_name: process.env.DB_NAME ? '✓ Set' : '✗ Missing',
      session_secret: process.env.SESSION_SECRET ? '✓ Set' : '✗ Missing'
    }
  });
});

// ==================== AUTHENTICATION ROUTES ====================
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/16192224');
  }
  res.render('login', {
    title: 'Login',
    error: null
  });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const [users] = await db.query(
      'SELECT * FROM users WHERE username = ?',
      [username]
    );
    
    if (users.length === 0) {
      return res.render('login', {
        title: 'Login',
        error: 'Invalid username or password'
      });
    }
    
    const user = users[0];
    const isValid = await comparePassword(password, user.password_hash);
    
    if (isValid) {
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };
      return res.redirect('/16192224');
    } else {
      res.render('login', {
        title: 'Login',
        error: 'Invalid username or password'
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.render('login', {
      title: 'Login',
      error: 'Server error. Please try again.'
    });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// ==================== ADMIN ROUTES ====================
app.get('/16192224', isAuthenticated, async (req, res) => {
  try {
    const [posts] = await db.query(`
      SELECT * FROM posts 
      ORDER BY created_at DESC
    `);
    
    res.render('admin', {
      title: 'Admin Panel',
      posts,
      user: req.session.user
    });
  } catch (error) {
    res.render('admin', {
      title: 'Admin Panel',
      posts: [],
      user: req.session.user,
      error: 'Could not load posts'
    });
  }
});

// Create post - GET
app.get('/16192224/create', isAuthenticated, (req, res) => {
  res.render('create-post', {
    title: 'Create New Post',
    user: req.session.user
  });
});

// Create post - POST
app.post('/16192224/create', isAuthenticated, upload.single('image'), async (req, res) => {
  const { title, content, video } = req.body;
  const slug = slugify(title, { lower: true, strict: true });
  
  let imageData = null;
  if (req.file) {
    // Convert image to base64 for database storage
    imageData = {
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer.toString('base64'),
      uploadedAt: new Date().toISOString()
    };
  }
  
  try {
    await db.query(
      `INSERT INTO posts (title, content, image_data, video_url, slug) 
       VALUES (?, ?, ?, ?, ?)`,
      [title, content, JSON.stringify(imageData), video, slug]
    );
    
    res.redirect('/16192224');
  } catch (error) {
    console.error('Create post error:', error);
    res.render('create-post', {
      title: 'Create New Post',
      user: req.session.user,
      error: 'Failed to create post'
    });
  }
});

// Edit post - GET
app.get('/16192224/edit/:id', isAuthenticated, async (req, res) => {
  try {
    const [posts] = await db.query(
      'SELECT * FROM posts WHERE id = ?',
      [req.params.id]
    );
    
    if (posts.length === 0) {
      return res.status(404).send('Post not found');
    }
    
    const post = posts[0];
    if (post.image_data) {
      post.image_data = JSON.parse(post.image_data);
    }
    
    res.render('edit-post', {
      title: 'Edit Post',
      post,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Edit post - POST
app.post('/16192224/edit/:id', isAuthenticated, upload.single('image'), async (req, res) => {
  const { title, content, video } = req.body;
  const slug = slugify(title, { lower: true, strict: true });
  
  try {
    // Get existing post
    const [posts] = await db.query(
      'SELECT image_data FROM posts WHERE id = ?',
      [req.params.id]
    );
    
    let imageData = posts[0]?.image_data;
    if (req.file) {
      // Update with new image
      imageData = {
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        data: req.file.buffer.toString('base64'),
        uploadedAt: new Date().toISOString()
      };
    }
    
    await db.query(
      `UPDATE posts 
       SET title = ?, content = ?, image_data = ?, video_url = ?, slug = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, content, JSON.stringify(imageData), video, slug, req.params.id]
    );
    
    res.redirect('/16192224');
  } catch (error) {
    console.error('Edit post error:', error);
    res.redirect('/16192224');
  }
});

// Delete post
app.get('/16192224/delete/:id', isAuthenticated, async (req, res) => {
  try {
    await db.query('DELETE FROM posts WHERE id = ?', [req.params.id]);
    res.redirect('/16192224');
  } catch (error) {
    console.error('Delete error:', error);
    res.redirect('/16192224');
  }
});

// Admission info
app.get('/admission-info', (req, res) => {
  res.render('admission-info', {
    title: 'Admission Information',
    user: req.session.user
  });
});

// View single post
app.get('/post/:slug', async (req, res) => {
  try {
    const [posts] = await db.query(
      'SELECT * FROM posts WHERE slug = ? AND published = 1',
      [req.params.slug]
    );
    
    if (posts.length === 0) {
      return res.status(404).render('404', {
        title: 'Post Not Found',
        user: req.session.user
      });
    }
    
    const post = posts[0];
    if (post.image_data) {
      post.image_data = JSON.parse(post.image_data);
    }
    
    res.render('post', {
      title: post.title,
      post,
      user: req.session.user
    });
  } catch (error) {
    res.status(500).render('error', {
      title: 'Error',
      message: 'Could not load post',
      user: req.session.user
    });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', {
    title: 'Page Not Found',
    user: req.session.user
  });
});

// Global error handler
app.use(errorHandler);

// Initialize database on startup
testDBConnection();

export default app;
