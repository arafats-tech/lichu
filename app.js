import express from 'express';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Import your utilities (DB connection, auth, sanitize function, error handler)
import { db, isAuthenticated, sanitizeTitle, errorHandler } from './utils.js';

dotenv.config();

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// For file uploads (Multer v2)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads/')); // Local uploads folder
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeTitle(file.originalname);
    cb(null, `${Date.now()}-${sanitized}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage });

// ---------------- Routes ----------------

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
    const imagePath = req.file ? `/uploads/${sanitizeTitle(title)}${path.extname(req.file.originalname)}` : null;
    const postSlug = sanitizeTitle(title);

    try {
        await db.query(
            'UPDATE posts SET title = ?, content = ?, image = ?, video = ?, slug = ? WHERE id = ?',
            [title, content, imagePath, video, postSlug, postId]
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
    res.render('admission-info');
});

// Dropdown edit post
app.get('/16192224/edit', isAuthenticated, async (req, res, next) => {
    try {
        const [posts] = await db.query('SELECT id, title FROM posts');
        const selectedPostId = req.query.postId;
        let selectedPost = null;

        if (selectedPostId) {
            const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [selectedPostId]);
            selectedPost = results.length > 0 ? results[0] : null;
        }

        res.render('edit-post-dropdown', { title: 'Edit Post', posts, selectedPost, sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// ---------------- Error Handling ----------------
app.use(errorHandler);

// ---------------- Vercel Deployment ----------------
// Don't use app.listen; export app for Vercel
export default app;
