const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise'); // Use promise-based MySQL
const dotenv = require('dotenv');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');

// Initialize dotenv
dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;

// Function to sanitize the title for filename and URL
const sanitizeTitle = (title) => {
    const isBangla = /[\u0980-\u09FF]/.test(title); // Bangla Unicode range

    return title
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with '-'
        .replace(/[^\w\u0980-\u09FF\-]/g, '') // Remove all non-word characters except hyphens
        .replace(/^-|-$/g, '') // Remove leading or trailing '-'
        .toLowerCase(); // Convert to lowercase
};

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the favicon
app.get('/logo.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'logo.ico')); // Adjust the path if necessary
});

// Route to serve Admission.png
app.get('/Admission.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Admission.png')); // Adjust the path if necessary
});


// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const sanitizedTitle = sanitizeTitle(req.body.title);
        const extension = path.extname(file.originalname);
        cb(null, `${sanitizedTitle}${extension}`);
    },
});
const upload = multer({ storage });

// Create MySQL connection pool
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret', // Use env variable for secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true } // Set secure: true if using HTTPS
}));

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return next();
    }
    res.redirect('/login'); // Redirect to login if not authenticated
};

// Centralized error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong. Please try again later.');
};

// Login Route - Show login form
app.get('/login', (req, res) => {
    res.render('login', { title: 'Login', errorMessage: null });
});

// Handle login submission
app.post('/login', async (req, res, next) => {
    const { username, password } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (results.length > 0) {
            const user = results[0];
            const match = await bcrypt.compare(password, user.password);

            if (!match) {
                return res.render('login', { title: 'Login', errorMessage: 'Invalid credentials' });
            }

            req.session.user = { id: user.id, username: user.username };
            return res.redirect('/admin');
        } else {
            return res.render('login', { title: 'Login', errorMessage: 'Invalid credentials' });
        }
    } catch (err) {
        return next(err);
    }
});

// Predefined credentials for registration access
const predefinedUsername = 'Nahid';
const predefinedPassword = '106275';

// Register Route - Show registration form
app.get('/register', (req, res) => {
    res.render('register', { title: 'Register', errorMessage: null });
});

// Handle registration submission
app.post('/register', async (req, res) => {
    const { username, password, accessUsername, accessPassword } = req.body;

    // Check if access credentials match predefined ones
    if (accessUsername !== predefinedUsername || accessPassword !== predefinedPassword) {
        return res.render('register', { title: 'Register', errorMessage: 'Invalid registration credentials' });
    }

    try {
        // Check if the username already exists in the database
        const [existingUser] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

        if (existingUser.length > 0) {
            // If username is taken, show an error message
            return res.render('register', { title: 'Register', errorMessage: 'Username already taken' });
        }

        // Hash the password with bcrypt
        const hashedPassword = await bcrypt.hash(password, 10);

        // Insert new user into the database
        await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);

        // Redirect to login page or a success message
        res.redirect('/login');
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).send('Error registering user. Please try again.');
    }
});

// Logout Route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error logging out:', err);
        }
        res.redirect('/'); // Redirect to homepage after logout
    });
});

// Index Route - Show posts on homepage
app.get('/', async (req, res, next) => {
    try {
        const [results] = await db.query('SELECT * FROM posts ORDER BY id DESC');
        res.render('index', { title: 'Home', posts: results, sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Admin Panel Route - Show posts in admin panel
app.get('/admin', isAuthenticated, async (req, res, next) => {
    try {
        const [results] = await db.query('SELECT * FROM posts');
        res.render('admin', { title: 'Admin Panel', posts: results, sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Add Post Route - Get form for adding posts
app.get('/admin/add', isAuthenticated, (req, res) => {
    res.render('add-post', { title: 'Add Post' });
});

// Handle post submission with optional image and video upload
app.post('/admin/add', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const { title, content, video } = req.body;
    const imagePath = req.file ? `/uploads/${sanitizeTitle(title)}${path.extname(req.file.originalname)}` : null;
    const postSlug = sanitizeTitle(title);

    try {
        await db.query('INSERT INTO posts (title, content, image, video, slug) VALUES (?, ?, ?, ?, ?)', [title, content, imagePath, video, postSlug]);
        res.redirect('/admin');
    } catch (err) {
        next(err);
    }
});

// View Full Post Route
app.get('/post/:slug', async (req, res, next) => {
    const postSlug = req.params.slug;

    try {
        const [results] = await db.query('SELECT * FROM posts WHERE slug = ?', [postSlug]);
        if (results.length === 0) return res.status(404).send('Post not found.');
        res.render('post', { title: results[0].title, post: results[0], sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Edit Post Route - Get form for editing posts
app.get('/admin/edit/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;

    try {
        const [results] = await db.query('SELECT * FROM posts WHERE id = ?', [postId]);
        if (results.length === 0) return res.status(404).send('Post not found.');
        res.render('edit-post', { title: 'Edit Post', post: results[0], sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Handle edit post submission
app.post('/admin/edit/:id', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const postId = req.params.id;
    const { title, content, video } = req.body;
    const imagePath = req.file ? `/uploads/${sanitizeTitle(title)}${path.extname(req.file.originalname)}` : null;
    const postSlug = sanitizeTitle(title);

    try {
        await db.query('UPDATE posts SET title = ?, content = ?, image = ?, video = ?, slug = ? WHERE id = ?', [title, content, imagePath, video, postSlug, postId]);
        res.redirect('/admin');
    } catch (err) {
        next(err);
    }
});

// Delete Post Route
app.get('/admin/delete/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;

    try {
        await db.query('DELETE FROM posts WHERE id = ?', [postId]);
        res.redirect('/admin');
    } catch (err) {
        next(err);
    }
});

// Route to show dropdown of posts and select one to edit
app.get('/admin/edit', isAuthenticated, async (req, res, next) => {
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Error handling middleware
app.use(errorHandler);