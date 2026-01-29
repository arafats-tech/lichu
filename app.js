const express = require('express');
const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');

// Load environment variables
dotenv.config();
const app = express();
const PORT = process.env.PORT || 8080;





// Register the Noto Sans Bengali font
const banglaFontPath = path.join(__dirname, 'public/static/NotoSansBengali-Regular.ttf');
try {
    registerFont(banglaFontPath, { family: 'Noto Sans Bengali' });
    console.log("Bangla font loaded successfully.");
} catch (error) {
    console.error("Failed to register Bangla font:", error);
}

// Function to wrap text and return an array of lines
const wrapText = (ctx, text, maxWidth) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(`${currentLine} ${word}`).width;
        if (width < maxWidth) {
            currentLine += ` ${word}`;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
};

// Function to adjust font size based on text width
const adjustFontSize = (ctx, text, maxWidth, initialFontSize, fontFamily) => {
    let fontSize = initialFontSize;
    ctx.font = `${fontSize}px ${fontFamily}`;
    while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
        fontSize -= 1;
        ctx.font = `${fontSize}px ${fontFamily}`;
    }
    return fontSize;
};

// Function to select a random background color
const getRandomBackground = () => {
    const colors = ['#FF5733', '#33FF57', '#3357FF', '#FFFF33', '#FF33FF', '#33FFFF'];
    return colors[Math.floor(Math.random() * colors.length)];
};

// Generate an image with customized text
const generateImage = (title, banglaTitle, bgColor) => {
    const canvasWidth = 800;
    const canvasHeight = 430;
    const padding = 5; // 5px padding
    const lineSpacing = 10;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Set background color
    ctx.fillStyle = bgColor || getRandomBackground();
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Add a semi-transparent overlay for text clarity
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Set text color
    ctx.fillStyle = '#FFFFFF';

    // Calculate font sizes
    const englishFontSize = adjustFontSize(ctx, title, canvasWidth - padding * 2, 50, 'Courier New, monospace');
    const banglaFontSize = adjustFontSize(ctx, banglaTitle, canvasWidth - padding * 2, 50, 'Noto Sans Bengali');

    // Draw English title
    ctx.font = `bold ${englishFontSize}px "Courier New", monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let currentY = padding; // Start from padding
    const englishLines = wrapText(ctx, title, canvasWidth - padding * 2);
    englishLines.forEach(line => {
        ctx.fillText(line, padding, currentY); // Start from padding
        currentY += englishFontSize + lineSpacing;
    });

    // Draw Bengali title
    ctx.font = `bold ${banglaFontSize}px "Noto Sans Bengali"`;
    const banglaLines = wrapText(ctx, banglaTitle, canvasWidth - padding * 2);
    banglaLines.forEach(line => {
        ctx.fillText(line, padding, currentY); // Start from padding
        currentY += banglaFontSize + lineSpacing;
    });

    // Return image as data URL
    return canvas.toDataURL();
};

// Endpoint to generate and display the image directly in HTML
app.get('/ai', (req, res) => {
    const title = req.query.title || "Arafat's Tech";
    const banglaTitle = req.query.banglaTitle || '';
    const bgColor = req.query.bgColor || getRandomBackground();

    try {
        const imageDataUrl = generateImage(title, banglaTitle, bgColor);

        // Display the generated image in a simple HTML page
        res.send(`
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>${title}</title>
                    <style>
                        body { 
                            margin: 0; 
                            padding: 0; 
                            display: flex; 
                            justify-content: center; 
                            align-items: center; 
                            height: 100vh; /* Full viewport height */
                            background-color: #f0f0f0; /* Optional background color */
                        }
                        img { 
                            display: block; 
                            width: 100%;  /* Ensure the image is responsive to viewport width */
                            height: auto; /* Maintain aspect ratio */
                            max-width: 800px; /* Limit the maximum width of the image */
                        }
                    </style>
                </head>
                <body>
                    <img src="${imageDataUrl}" alt="${title}">
                </body>
            </html>
        `);
    } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).send(`
            <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error generating image</h1>
                    <p>Something went wrong while generating your image. Please try again later.</p>
                </body>
            </html>
        `);
    }
});



const sanitizeTitle = (title) => {
    return title
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\u0980-\u09FF\-]/g, '')
        .replace(/^-|-$/g, '')
        .toLowerCase();
};

// MySQL connection pool
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
    secret: process.env.SESSION_SECRET || 'default_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true }
}));

// Ensure 'uploads' directory exists
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const sanitizedTitle = sanitizeTitle(req.body.title);
        const extension = path.extname(file.originalname);
        cb(null, `${sanitizedTitle}${extension}`);
    },
});
const upload = multer({ storage });

// Middleware for checking authentication
const isAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    res.redirect('/l');
};

// Centralized error handling
const errorHandler = (err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong. Please try again later.');
};

// Routes
app.get('/ai', (req, res) => {
    const title = req.query.title || 'Default Title';
    const imageDataUrl = generateImage(title);
    res.send(`<img src="${imageDataUrl}" alt="${title}">`);
});


app.get('/l', (req, res) => res.render('l', { title: 'Login', errorMessage: null }));

app.post('/l', async (req, res, next) => {
    const { username, password } = req.body;
    try {
        const [results] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (results.length > 0 && await bcrypt.compare(password, results[0].password)) {
            req.session.user = { id: results[0].id, username: results[0].username };
            return res.redirect('/16192224');
        }
        res.render('l', { title: 'Login', errorMessage: 'Invalid credentials' });
    } catch (err) {
        next(err);
    }
});

app.get('/r', (req, res) => res.render('r', { title: 'Register', errorMessage: null }));

app.post('/r', async (req, res) => {
    const { username, password, accessUsername, accessPassword } = req.body;
    if (accessUsername !== process.env.ACCESS_USERNAME || accessPassword !== process.env.ACCESS_PASSWORD) {
        return res.render('r', { title: 'Register', errorMessage: 'Invalid registration credentials' });
    }
    try {
        const [existingUser] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUser.length > 0) {
            return res.render('r', { title: 'Register', errorMessage: 'Username already taken' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);
        res.redirect('/l');
    } catch (error) {
        res.status(500).send('Error ring user. Please try again.');
    }
});

app.get('/16192224', isAuthenticated, async (req, res, next) => {
    try {
        const [results] = await db.query('SELECT * FROM posts');
        res.render('16192224', { title: 'Dashboard', posts: results, sanitizeTitle });
    } catch (err) {
        next(err);
    }
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

// Admin Panel Route - Show posts in 16192224 panel
app.get('/16192224', isAuthenticated, async (req, res, next) => {
    try {
        const [results] = await db.query('SELECT * FROM posts');
        res.render('16192224', { title: 'Dashboard', posts: results, sanitizeTitle });
    } catch (err) {
        next(err);
    }
});

// Add Post Route - Get form for adding posts
app.get('/16192224/add', isAuthenticated, (req, res) => {
    res.render('add-post', { title: 'Add Post' });
});

app.post('/16192224/add', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const { title, content, video } = req.body;
    const imagePath = req.file ? `/uploads/${sanitizeTitle(title)}${path.extname(req.file.originalname)}` : null;
    const postSlug = sanitizeTitle(title);

    try {
        await db.query('INSERT INTO posts (title, content, image, video, slug) VALUES (?, ?, ?, ?, ?)', [title, content, imagePath, video, postSlug]);
        res.redirect('/16192224');
    } catch (err) {
        next(err);
    }
});

// View Full Post Route
app.get('/p/:slug', async (req, res, next) => {
    const postSlug = req.params.slug;

    try {
        const [results] = await db.query('SELECT * FROM posts WHERE slug = ?', [postSlug]);
        if (results.length === 0) return res.status(404).send('Post not found.');
        res.render('p', { title: results[0].title, post: results[0], sanitizeTitle });
    } catch (err) {
        next(err);
    }
});


// Edit Post Route - Get form for editing posts
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

app.post('/16192224/edit/:id', isAuthenticated, upload.single('image'), async (req, res, next) => {
    const postId = req.params.id;
    const { title, content, video } = req.body;
    const imagePath = req.file ? `/uploads/${sanitizeTitle(title)}${path.extname(req.file.originalname)}` : null;
    const postSlug = sanitizeTitle(title);

    try {
        await db.query('UPDATE posts SET title = ?, content = ?, image = ?, video = ?, slug = ? WHERE id = ?', [title, content, imagePath, video, postSlug, postId]);
        res.redirect('/16192224');
    } catch (err) {
        next(err);
    }
});

// Delete Post Route
app.get('/16192224/delete/:id', isAuthenticated, async (req, res, next) => {
    const postId = req.params.id;

    try {
        await db.query('DELETE FROM posts WHERE id = ?', [postId]);
        res.redirect('/16192224');
    } catch (err) {
        next(err);
    }
});

//Define the route for admission-info
app.get('/admission-info', (req, res) => {
    // You can pass any necessary data to the view here
    res.render('admission-info');
});


// Route to show dropdown of posts and select one to edit
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

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// Error handling middleware
app.use(errorHandler);