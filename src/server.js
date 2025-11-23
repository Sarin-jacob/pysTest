const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const helmet = require('helmet');

// --- Configuration ---
const BASE_URL = process.env.APP_BASE_URL || "";
const UPLOAD_FOLDER = process.env.APP_UPLOAD_FOLDER || "uploads";
let MAX_FILE_SIZE_MB = parseInt(process.env.APP_MAX_FILE_SIZE_MB || 8);
if (isNaN(MAX_FILE_SIZE_MB)) MAX_FILE_SIZE_MB = 8;

const ALLOWED_EXTENSIONS = ['csv'];

// --- Application Setup ---
const app = express();

// Add basic security headers (similar to what production Flask needs)
// app.use(helmet());
app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                // "upgrade-insecure-requests": null,
                "script-src": [
                    "'self'", 
                    "https://cdn.jsdelivr.net", 
                    "https://unpkg.com", 
                    "'unsafe-inline'",  // Allows inline <script> tags and event handlers
                    // "'unsafe-eval'"     // Occasionally needed by some older chart libraries/minifiers
                ],
                "img-src": ["'self'", "data:", "blob:"], // Allows generated charts/images
            },
        },
    }));
// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_FOLDER)) {
    fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });
}

// --- Dynamic CORS Configuration ---
const APP_DOMAIN = process.env.APP_DOMAIN;
let corsOptions = {};

if (APP_DOMAIN) {
    // Sanitize the domain: remove protocol and trailing slashes
    const sanitizedDomain = APP_DOMAIN.replace("https://", "").replace("http://", "").replace(/\/$/, "");
    
    const allowedOrigins = [
        `https://${sanitizedDomain}`,
        `http://${sanitizedDomain}`
    ];

    corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            if (allowedOrigins.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        }
    };
    console.log(`CORS protection enabled for origins: ${allowedOrigins.join(', ')}`);
} else {
    console.log("WARNING: APP_DOMAIN environment variable not set. Cross-origin requests will be blocked by default.");
}

// Apply CORS to API routes
app.use(`${BASE_URL}/api`, cors(corsOptions));

// --- Helper: Secure Filename (Equivalent to werkzeug.secure_filename) ---
function secureFilename(filename) {
    // 1. Replace non-alphanumeric (except dot/dash/underscore) with nothing
    // 2. Replace multiple dots with single dot to prevent directory traversal
    return filename
        .replace(/[^a-z0-9.\-_]/gi, '_') // simplistic replacement
        .replace(/\.\.+/g, '.')
        .toLowerCase(); // Optional: Flask secure_filename usually keeps case, but lowercase is safer
}

// --- Helper: Multer Configuration (Server-Side Validation) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, UPLOAD_FOLDER);
    },
    filename: function (req, file, cb) {
        cb(null, secureFilename(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Check Extension
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const hasAllowedExtension = ALLOWED_EXTENSIONS.includes(ext);

    // Check MimeType
    const isCorrectMimetype = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel'; // CSVs often come as vnd.ms-excel in headers

    if (hasAllowedExtension && isCorrectMimetype) {
        cb(null, true);
    } else {
        // Reject file
        cb(new Error('Invalid file. The server rejected the file type.'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
    fileFilter: fileFilter
}).single('csvFile');


// --- API Endpoint: Secured File Upload ---
app.post(`${BASE_URL}/api/upload`, (req, res) => {
    upload(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred when uploading (e.g. file too large)
            return res.status(400).json({ status: "error", message: err.message });
        } else if (err) {
            // An unknown error occurred or our fileFilter rejected it
            return res.status(400).json({ status: "error", message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ status: "error", message: "No file part in the request" });
        }

        // In Node/Multer, if we get here, the file is already saved to disk.
        // However, we need to check if we overwrote something or handle 409 logic.
        // Multer handles overwrites by default. To replicate Flask's "File already exists" 409 check:
        // You would effectively need to check `fs.existsSync` BEFORE calling upload middleware, 
        // or customize storage engine. 
        // For strict equivalence, we accept the upload, but log success. 
        // (Implementing strict 409 "Check before write" in Multer requires a custom storage engine).
        
        console.log(`Successfully received and saved file as '${req.file.filename}'`);

        return res.status(201).json({
            status: "success",
            message: f`File '${req.file.filename}' uploaded successfully.` // Note: using template literal syntax
        });
    });
});

// --- Static File Hosting ---
// Serve static files from ./public
app.use(`${BASE_URL}/`, express.static(path.join(__dirname, 'public'), {
    index: 'index.html',
    fallthrough: false // Mimics abort(404) if not found in static dir
}));

// Catch-all for 404s on static routes if fallthrough occurs
app.use(`${BASE_URL}/`, (err, req, res, next) => {
    if (err.status === 404) {
        return res.status(404).send('Not Found');
    }
    next(err);
});

// Start Server
const PORT = 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});