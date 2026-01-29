import express from 'express';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import favicon from 'serve-favicon';
import { slugify } from 'slugify';

// Import utilities
import { db, isAuthenticated, sanitizeTitle, errorHandler, comparePassword } from './utils/index.js';

dotenv.config();

const app = express();

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security and performance middlewares
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));
app.use(compression());
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(favicon(path.join(__dirname, '../public', 'favicon.ico')));

// For file uploads - IMPORTANT: Vercel doesn't support persistent file storage
const storage = multer.memoryStorage(); // Use memory storage for Vercel
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Error: Images only!'));
    }
  }
});

// ==================== ROUTES ====================

// Home route
app.get('/', async (req, res, next) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts WHERE published = 1 ORDER BY created_at DESC LIMIT 10');
    res.render('index', { 
      title: 'Home - Lichu App', 
      posts,
      user: req.session.user 
    });
  } catch (err) {
    next(err);
  }
});

// Login routes
app.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/16192224');
  }
  res.render('login', { 
    title: 'Login', 
    error: null 
  });
});

app.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  
  try {
    // For demo - in production, fetch from database
    // Example: const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    // Demo credentials (change in production)
    const validUsername = process.env.ADMIN_USERNAME || 'admin';
    const validPassword = process.env.ADMIN_PASSWORD || 'password';
    
    if (username === validUsername && password === validPassword) {
      req.session.user = { 
        username,
        role: 'admin'
      };
      return res.redirect('/16192224');
    }
    
    res.render('login', { 
      title: 'Login', 
      error: 'Invalid username or password' 
    });
  } catch (err) {
    next(err);
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Admin panel
app.get('/16192224', isAuthenticated, async (req, res, next) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
    res.render('admin', { 
      title: 'Admin Panel', 
      posts, 
      user: req.session.user 
    });
  } catch (err) {
    next(err);
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
app.post('/16192224/create', isAuthenticated, upload.single('image'), async (req, res, next) => {
  const { title, content, video } = req.body;
  
  // For Vercel: You can't save files locally. Use cloud storage or database
  let imageData = null;
  if (req.file) {
    // Convert to base64 for database storage
    imageData = {
      data: req.file.buffer.toString('base64'),
      contentType: req.file.mimetype,
      filename: req.file.originalname
    };
  }
  
  const postSlug = slugify(title, { lower: true, strict: true });

  try {
    await db.query(
      'INSERT INTO posts (title, content, image_data, video, slug) VALUES (?, ?, ?, ?, ?)',
      [title, content, JSON.stringify(imageData), video, postSlug]
    );
    res.redirect('/16192224');
  } catch (err) {
    next(err);
  }
});

// Edit post by ID - GET
app.get('/16192224/edit/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;
    try {
        const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        if (results.length === 0) return res.status(404).send('Post not found.');
        
        // Parse image data if stored as JSON
        if (results[0].image_data) {
          results[0].image_data = JSON.parse(results[0].image_data);
        }
        
        res.render('edit-post', { 
          title: 'Edit Post', 
          post: results[0], 
          user: req.session.user 
        });
    } catch (err) {
        next(err);
    }
});

// Update post - POST
app.post('/16192224/edit/:id', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const postId = req.params.id;
    const { title, content, video } = req.body;
    
    try {
        // Check if post exists
        const [existing] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        if (existing.length === 0) {
          return res.status(404).send('Post not found.');
        }
        
        let imageData = existing[0].image_data;
        if (req.file) {
          // Update with new image
          imageData = {
            data: req.file.buffer.toString('base64'),
            contentType: req.file.mimetype,
            filename: req.file.originalname
          };
        }
        
        const postSlug = slugify(title, { lower: true, strict: true });
        
        await db.query(
          'UPDATE posts SET title = ?, content = ?, image_data = ?, video = ?, slug = ?, updated_at = NOW() WHERE id = ?',
          [title, content, JSON.stringify(imageData), video, postSlug, postId]
        );
        
        res.redirect('/16192224');
    } catch (err) {
        next(err);
    }
});

// Delete Post
app.get('/16192224/delete/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;
    try {
        await db.query('DELETE FROM posts WHERE id = ?', [postId]);
        res.redirect('/16192224');
    } catch (err) {
        next(err);
    }
});

// Admission info
app.get('/admission-info', (req, res) => {
    res.render('admission-info', { 
      title: 'Admission Information',
      user: req.session.user 
    });
});

// Dropdown edit post
app.get('/16192224/edit', isAuthenticated, async (req, res, next) => {
    try {
        const [posts] = await db.query('SELECT id, title FROM posts ORDER BY title');
        const selectedPostId = req.query.postId;
        let selectedPost = null;

        if (selectedPostId) {
            const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [selectedPostId]);
            if (results.length > 0) {
              selectedPost = results[0];
              // Parse image data if exists
              if (selectedPost.image_data) {
                selectedPost.image_data = JSON.parse(selectedPost.image_data);
              }
            }
        }

        res.render('edit-post-dropdown', { 
          title: 'Edit Post', 
          posts, 
          selectedPost,
          user: req.session.user
        });
    } catch (err) {
        next(err);
    }
});

// View single post
app.get('/post/:slug', async (req, res, next) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts WHERE slug = ?', [req.params.slug]);
    if (posts.length === 0) {
      return res.status(404).render('404', { title: 'Post Not Found' });
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
  } catch (err) {
    next(err);
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

// Export the app
export default app;
