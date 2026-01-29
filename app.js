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

// Import your utilities (DB connection, auth, sanitize function, error handler)
import { db, isAuthenticated, sanitizeTitle, errorHandler } from './utils.js';

dotenv.config();

const app = express();

// Get __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Security and performance middlewares
app.use(helmet({
  contentSecurityPolicy: false, // Adjust based on your needs
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
  secret: process.env.SESSION_SECRET || 'your-secret-key',
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
app.set('views', path.join(__dirname, 'views'));

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// For file uploads (Multer v2)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads/')); // Local uploads folder
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeTitle(file.originalname);
    cb(null, `${Date.now()}-${sanitized}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  }
});

// ---------------- Routes ----------------

// Home route
app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

// Main admin route
app.get('/16192224', isAuthenticated, async (req, res, next) => {
  try {
    const [posts] = await db.query('SELECT * FROM posts ORDER BY created_at DESC');
    res.render('admin', { title: 'Admin Panel', posts, sanitizeTitle });
  } catch (err) {
    next(err);
  }
});

// Create post route (if missing)
app.get('/16192224/create', isAuthenticated, (req, res) => {
  res.render('create-post', { title: 'Create Post' });
});

// Handle post creation
app.post('/16192224/create', isAuthenticated, upload.single('image'), async (req, res, next) => {
  const { title, content, video } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
  const postSlug = sanitizeTitle(title);

  try {
    await db.query(
      'INSERT INTO posts (title, content, image, video, slug) VALUES (?, ?, ?, ?, ?)',
      [title, content, imagePath, video, postSlug]
    );
    res.redirect('/16192224');
  } catch (err) {
    next(err);
  }
});

// Edit post by ID
app.get('/16192224/edit/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;
    try {
        const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        if (results.length === 0) return res.status(404).send('Post not found.');
        res.render('edit-post', { title: 'Edit Post', post: results[0], sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Update post
app.post('/16192224/edit/:id', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const postId = req.params.id;
    const { title, content, video } = req.body;
    
    // Check if there's a new file
    let imagePath = null;
    if (req.file) {
        imagePath = `/uploads/${req.file.filename}`;
    }

    const postSlug = sanitizeTitle(title);

    try {
        // Build dynamic update query based on whether there's a new image
        let query = 'UPDATE posts SET title = ?, content = ?, video = ?, slug = ?';
        const params = [title, content, video, postSlug];
        
        if (imagePath) {
            query = query.replace('video = ?,', 'image = ?, video = ?,');
            params.splice(2, 0, imagePath); // Insert image at position 2
        }
        
        query += ' WHERE id = ?';
        params.push(postId);
        
        await db.query(query, params);
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
    res.render('admission-info', { title: 'Admission Info' });
});

// Dropdown edit post
app.get('/16192224/edit', isAuthenticated, async (req, res, next) => {
    try {
        const [posts] = await db.query('SELECT id, title FROM posts ORDER BY title');
        const selectedPostId = req.query.postId;
        let selectedPost = null;

        if (selectedPostId) {
            const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [selectedPostId]);
            selectedPost = results.length > 0 ? results[0] : null;
        }

        res.render('edit-post-dropdown', { 
          title: 'Edit Post', 
          posts, 
          selectedPost, 
          sanitizeTitle 
        });
    } catch (err) {
        next(err);
    }
});

// Login route (if missing)
app.get('/login', (req, res) => {
  res.render('login', { title: 'Login' });
});

app.post('/login', async (req, res, next) => {
  const { username, password } = req.body;
  
  // Add your authentication logic here
  // This is just a placeholder
  if (username === 'admin' && password === 'password') {
    req.session.user = { username };
    res.redirect('/16192224');
  } else {
    res.render('login', { 
      title: 'Login', 
      error: 'Invalid credentials' 
    });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ---------------- Error Handling ----------------
app.use(errorHandler);

// ---------------- Export for Vercel ----------------
export default app;
