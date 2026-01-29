const multer = require('multer');
const path = require('path');
const sanitizeTitle = require('../functions/sanitize');

// Multer configuration for file uploads
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

module.exports = upload;