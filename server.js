const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const validator = require('validator');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Render/Cloud platforms (required for rate-limit and secure cookies)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// ============================================
// SECURITY CONFIGURATION
// ============================================

// Generate a secure session secret (use env variable in production)
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

// Helmet - Security Headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Permissions-Policy header (set manually for better compatibility)
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()'
    );
    next();
});

// CORS - Configuration for production and development
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:8080'];

app.use(cors({
    origin: function(origin, callback) {
        // Allow requests with no origin (same-origin requests, mobile apps, curl)
        // This is safe because session cookies are used for authentication
        if (!origin) {
            return callback(null, true);
        }
        // In production, also allow the Render domain
        if (process.env.NODE_ENV === 'production') {
            // Allow any .onrender.com domain or configured origins
            if (origin.endsWith('.onrender.com') || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
        }
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Cookie Parser
app.use(cookieParser());

// Session Configuration
app.use(session({
    secret: SESSION_SECRET,
    name: 'planificacion_sid', // Custom session cookie name
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
        httpOnly: true, // Prevent XSS access to cookie
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
        sameSite: 'lax' // 'lax' works for same-site navigation in production
    }
}));

// Rate Limiting - General (permissive for development)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // limit each IP to 500 requests per windowMs (increased for development)
    message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiting - Login (stricter)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 login attempts per windowMs
    message: { error: 'Demasiados intentos de login, intenta de nuevo en 15 minutos' },
    standardHeaders: true,
    legacyHeaders: false
});

// Apply general rate limiter to all API routes
app.use('/api/', generalLimiter);

// Body Parser with size limits
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// Serve static files
app.use(express.static('public'));

// Multer setup for CSV uploads with security
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Sanitize filename
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${Date.now()}-${sanitizedName}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Only allow CSV files
    const allowedMimes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    const allowedExts = ['.csv'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten archivos CSV'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max
        files: 1
    }
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const requireAuth = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
    }
    next();
};

const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'No autorizado. Por favor inicia sesión.' });
    }
    if (req.session.user.role !== 'administrador') {
        return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
};

// ============================================
// INPUT VALIDATION HELPERS
// ============================================

const sanitizeString = (str) => {
    if (!str) return '';
    return validator.escape(validator.trim(str));
};

const validateId = (id) => {
    const parsed = parseInt(id);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
};

const validateYear = (year) => {
    const parsed = parseInt(year);
    return !isNaN(parsed) && parsed >= 2020 && parsed <= 2100 ? parsed : null;
};

const validateWeek = (week) => {
    const parsed = parseInt(week);
    return !isNaN(parsed) && parsed >= 1 && parsed <= 53 ? parsed : null;
};

const validateHours = (hours) => {
    const parsed = parseFloat(hours);
    return !isNaN(parsed) && parsed >= 0 && parsed <= 24 ? parsed : null;
};

const validateDate = (dateStr) => {
    if (!dateStr) return null;
    // Check YYYY-MM-DD format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) ? dateStr : null;
};

// Helper to enforce area access - returns the allowed area ID or null for all areas
const getEnforcedAreaId = (req, requestedAreaId) => {
    const userAreaId = req.session?.user?.id_area;
    // If user has an assigned area, they can ONLY access that area
    if (userAreaId) {
        return userAreaId; // Force user's area regardless of what they requested
    }
    // If user has no assigned area (admin/global), allow requested area or null for all
    return requestedAreaId || null;
};

// ============================================
// Health check endpoint
// ============================================
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Authentication Endpoints
// ============================================

// Login endpoint with rate limiting
app.post('/api/auth/login', loginLimiter, (req, res) => {
    const username = sanitizeString(req.body.username);
    const password = req.body.password; // Don't sanitize password (might contain special chars)

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    if (username.length > 50 || password.length > 100) {
        return res.status(400).json({ error: 'Datos de entrada inválidos' });
    }

    db.get('SELECT id, username, password, role, name, id_area FROM usuarios WHERE username = ?',
        [username], async (err, user) => {
            if (err) {
                console.error('[Login] Database error:', err);
                return res.status(500).json({ error: 'Error del servidor' });
            }
            if (!user) {
                // Use same message for both cases to prevent user enumeration
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            try {
                // Check if password is hashed (starts with $2a$ or $2b$)
                let passwordMatch;
                if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
                    passwordMatch = await bcrypt.compare(password, user.password);
                } else {
                    // Legacy plain text password - compare and then hash it
                    passwordMatch = (user.password === password);
                    if (passwordMatch) {
                        // Upgrade to hashed password
                        const hashedPassword = await bcrypt.hash(password, 12);
                        db.run('UPDATE usuarios SET password = ? WHERE id = ?',
                            [hashedPassword, user.id], (err) => {
                                if (err) console.error('[Login] Failed to upgrade password hash');
                                else console.log('[Login] Upgraded legacy password to bcrypt hash');
                            });
                    }
                }

                if (!passwordMatch) {
                    return res.status(401).json({ error: 'Credenciales inválidas' });
                }

                // Regenerate session to prevent session fixation attacks
                const userData = {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    name: user.name,
                    id_area: user.id_area
                };

                req.session.regenerate((err) => {
                    if (err) {
                        console.error('[Login] Session regeneration error:', err);
                        return res.status(500).json({ error: 'Error del servidor' });
                    }

                    // Create session with user data
                    req.session.user = userData;

                    req.session.save((err) => {
                        if (err) {
                            console.error('[Login] Session save error:', err);
                            return res.status(500).json({ error: 'Error del servidor' });
                        }

                        res.json({
                            success: true,
                            user: userData
                        });
                    });
                });
            } catch (error) {
                console.error('[Login] Error:', error);
                res.status(500).json({ error: 'Error del servidor' });
            }
        });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión' });
        }
        res.clearCookie('planificacion_sid');
        res.json({ success: true });
    });
});

// Check session endpoint
app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ authenticated: true, user: req.session.user });
    } else {
        res.json({ authenticated: false });
    }
});

// ============================================
// Users CRUD Endpoints (Admin only)
// ============================================

app.get('/api/config/usuarios', requireAdmin, (req, res) => {
    const sql = `
        SELECT u.id, u.username, u.role, u.name, u.id_area, u.created_at,
               a.name as area_name
        FROM usuarios u
        LEFT JOIN areas a ON u.id_area = a.id
        ORDER BY u.name
    `;
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/usuarios', requireAdmin, async (req, res) => {
    const username = sanitizeString(req.body.username);
    const password = req.body.password;
    const role = sanitizeString(req.body.role);
    const name = sanitizeString(req.body.name);
    const id_area = validateId(req.body.id_area);

    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Usuario, contraseña y rol son requeridos' });
    }

    if (username.length < 3 || username.length > 50) {
        return res.status(400).json({ error: 'El usuario debe tener entre 3 y 50 caracteres' });
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    if (!['administrador', 'visualizador'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 12);
        db.run('INSERT INTO usuarios (username, password, role, name, id_area) VALUES (?, ?, ?, ?, ?)',
            [username, hashedPassword, role, name || username, id_area], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'El usuario ya existe' });
                    }
                    return res.status(500).json({ error: 'Error del servidor' });
                }
                res.json({ id: this.lastID, username, role, name: name || username, id_area });
            });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.put('/api/config/usuarios/:id', requireAdmin, async (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const username = sanitizeString(req.body.username);
    const password = req.body.password;
    const role = sanitizeString(req.body.role);
    const name = sanitizeString(req.body.name);
    const id_area = req.body.id_area === null || req.body.id_area === '' ? null : validateId(req.body.id_area);

    if (!username || !role) {
        return res.status(400).json({ error: 'Usuario y rol son requeridos' });
    }

    if (!['administrador', 'visualizador'].includes(role)) {
        return res.status(400).json({ error: 'Rol inválido' });
    }

    try {
        let sql, params;
        if (password) {
            if (password.length < 8) {
                return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
            }
            const hashedPassword = await bcrypt.hash(password, 12);
            sql = 'UPDATE usuarios SET username = ?, password = ?, role = ?, name = ?, id_area = ? WHERE id = ?';
            params = [username, hashedPassword, role, name || username, id_area, id];
        } else {
            sql = 'UPDATE usuarios SET username = ?, role = ?, name = ?, id_area = ? WHERE id = ?';
            params = [username, role, name || username, id_area, id];
        }

        db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({ success: true, changes: this.changes });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error del servidor' });
    }
});

app.delete('/api/config/usuarios/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    // Prevent deleting yourself
    if (req.session.user && req.session.user.id === id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/config/usuarios', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    // Prevent deleting yourself
    if (req.session.user && validIds.includes(req.session.user.id)) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM usuarios WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} usuarios` });
    });
});

// ============================================
// Configuration CRUD Endpoints (Require Auth)
// ============================================

// COLABORADORES
app.get('/api/config/colaboradores', requireAuth, (req, res) => {
    db.all(`SELECT c.*, a.name as area_name
            FROM colaboradores c
            LEFT JOIN areas a ON c.id_area = a.id
            ORDER BY c.name`, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/colaboradores', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }
    const id_area = req.body.id_area ? validateId(req.body.id_area) : null;

    db.run('INSERT INTO colaboradores (name, id_area) VALUES (?, ?)', [name, id_area], function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ id: this.lastID, name, id_area });
    });
});

app.put('/api/config/colaboradores/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }
    const id_area = req.body.id_area ? validateId(req.body.id_area) : null;

    db.run('UPDATE colaboradores SET name = ?, id_area = ? WHERE id = ?', [name, id_area, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Actualizado correctamente' });
    });
});

app.delete('/api/config/colaboradores/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM colaboradores WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/colaboradores/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM colaboradores WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// Get colaboradores by area (for new planning)
app.get('/api/config/colaboradores/by-area/:areaId', requireAuth, (req, res) => {
    const areaId = validateId(req.params.areaId);
    if (!areaId) return res.status(400).json({ error: 'ID de área inválido' });

    db.all('SELECT * FROM colaboradores WHERE id_area = ? ORDER BY name', [areaId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

// PROYECTOS
app.get('/api/config/proyectos', requireAuth, (req, res) => {
    db.all('SELECT * FROM proyectos ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/proyectos', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('INSERT INTO proyectos (name) VALUES (?)', [name], function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/proyectos/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('UPDATE proyectos SET name = ? WHERE id = ?', [name, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Actualizado correctamente' });
    });
});

app.delete('/api/config/proyectos/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM proyectos WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/proyectos/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM proyectos WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// TIPOS DE PROYECTO
app.get('/api/config/tipos', requireAuth, (req, res) => {
    db.all('SELECT * FROM tipo_proyecto ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/tipos', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('INSERT INTO tipo_proyecto (name) VALUES (?)', [name], function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/tipos/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('UPDATE tipo_proyecto SET name = ? WHERE id = ?', [name, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Actualizado correctamente' });
    });
});

app.delete('/api/config/tipos/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM tipo_proyecto WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/tipos/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM tipo_proyecto WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// ÁREAS
app.get('/api/config/areas', requireAuth, (req, res) => {
    db.all('SELECT * FROM areas ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/areas', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    const regionId = req.body.region_id ? validateId(req.body.region_id) : null;
    const paisId = req.body.pais_id ? validateId(req.body.pais_id) : null;

    db.run('INSERT INTO areas (name, region_id, pais_id) VALUES (?, ?, ?)', [name, regionId, paisId], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'El área ya existe' });
            }
            return res.status(500).json({ error: 'Error del servidor' });
        }
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/areas/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    const regionId = req.body.region_id ? validateId(req.body.region_id) : null;
    const paisId = req.body.pais_id ? validateId(req.body.pais_id) : null;

    db.run('UPDATE areas SET name = ?, region_id = ?, pais_id = ? WHERE id = ?', [name, regionId, paisId, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Actualizado correctamente' });
    });
});

app.delete('/api/config/areas/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM areas WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/areas/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM areas WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// CLIENTES
app.get('/api/config/clientes', requireAuth, (req, res) => {
    // Enforce area access based on user's assigned area
    const id_area = getEnforcedAreaId(req, validateId(req.query.id_area));
    let sql = `
        SELECT
            c.id,
            c.name,
            c.id_proyecto as proyecto_id,
            c.id_tipo_proyecto as tipo_id,
            c.id_area,
            c.region_id,
            c.pais_id,
            p.name as proyecto_name,
            t.name as tipo_name,
            a.name as area_name,
            r.name as region_name,
            pa.name as pais_name
        FROM clientes c
        LEFT JOIN proyectos p ON c.id_proyecto = p.id
        LEFT JOIN tipo_proyecto t ON c.id_tipo_proyecto = t.id
        LEFT JOIN areas a ON c.id_area = a.id
        LEFT JOIN regiones r ON c.region_id = r.id
        LEFT JOIN paises pa ON c.pais_id = pa.id
    `;
    const params = [];
    if (id_area) {
        sql += ' WHERE c.id_area = ?';
        params.push(id_area);
    }
    sql += ' ORDER BY c.name';
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/clientes', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    const id_proyecto = validateId(req.body.id_proyecto);
    const id_tipo_proyecto = validateId(req.body.id_tipo_proyecto);
    const id_area = validateId(req.body.id_area);
    const region_id = validateId(req.body.region_id);
    const pais_id = validateId(req.body.pais_id);

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run(
        'INSERT INTO clientes (name, id_proyecto, id_tipo_proyecto, id_area, region_id, pais_id) VALUES (?, ?, ?, ?, ?, ?)',
        [name, id_proyecto, id_tipo_proyecto, id_area, region_id, pais_id],
        function(err) {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({ id: this.lastID, name, id_proyecto, id_tipo_proyecto, id_area, region_id, pais_id });
        }
    );
});

app.put('/api/config/clientes/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    const id_proyecto = validateId(req.body.id_proyecto);
    const id_tipo_proyecto = validateId(req.body.id_tipo_proyecto);
    const id_area = req.body.id_area === null || req.body.id_area === '' ? null : validateId(req.body.id_area);
    const region_id = req.body.region_id === null || req.body.region_id === '' ? null : validateId(req.body.region_id);
    const pais_id = req.body.pais_id === null || req.body.pais_id === '' ? null : validateId(req.body.pais_id);

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run(
        'UPDATE clientes SET name = ?, id_proyecto = ?, id_tipo_proyecto = ?, id_area = ?, region_id = ?, pais_id = ? WHERE id = ?',
        [name, id_proyecto, id_tipo_proyecto, id_area, region_id, pais_id, id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({ message: 'Actualizado correctamente' });
        }
    );
});

app.delete('/api/config/clientes/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM clientes WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/clientes/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM clientes WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// ============================================
// CSV Import Endpoints (Admin only)
// ============================================

app.get('/api/init-data', requireAuth, (req, res) => {
    const data = {};
    db.all("SELECT * FROM colaboradores ORDER BY name", (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        data.workers = rows;

        db.all("SELECT * FROM clientes ORDER BY name", (err, rows) => {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            data.projects = rows;
            res.json(data);
        });
    });
});

// CSV Helper
function parseCSV(content) {
    const lines = content.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => sanitizeString(h));
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => sanitizeString(v));
        const obj = {};
        headers.forEach((header, index) => { obj[header] = values[index] || ''; });
        return obj;
    });
}

// CSV Import with error handling for multer
const handleUploadError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'El archivo es demasiado grande (máximo 5MB)' });
        }
        return res.status(400).json({ error: 'Error al subir archivo' });
    } else if (err) {
        return res.status(400).json({ error: err.message });
    }
    next();
};

app.post('/api/config/colaboradores/import', requireAdmin, upload.single('file'), handleUploadError, (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        let count = 0;

        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('colab') || k.toLowerCase().includes('nombre'));
            if (key && row[key] && row[key].trim()) {
                const name = sanitizeString(row[key]);
                if (name.length >= 2 && name.length <= 100) {
                    db.run('INSERT OR IGNORE INTO colaboradores (name) VALUES (?)', [name]);
                    count++;
                }
            }
        });

        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Import error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Error al importar' });
    }
});

app.post('/api/config/proyectos/import', requireAdmin, upload.single('file'), handleUploadError, (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        let count = 0;

        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('proy') || k.toLowerCase().includes('nombre'));
            if (key && row[key] && row[key].trim()) {
                const name = sanitizeString(row[key]);
                if (name.length >= 2 && name.length <= 100) {
                    db.run('INSERT OR IGNORE INTO proyectos (name) VALUES (?)', [name]);
                    count++;
                }
            }
        });

        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Import error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Error al importar' });
    }
});

app.post('/api/config/tipos/import', requireAdmin, upload.single('file'), handleUploadError, (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        let count = 0;

        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('tipo') || k.toLowerCase().includes('nombre'));
            if (key && row[key] && row[key].trim()) {
                const name = sanitizeString(row[key]);
                if (name.length >= 2 && name.length <= 100) {
                    db.run('INSERT OR IGNORE INTO tipo_proyecto (name) VALUES (?)', [name]);
                    count++;
                }
            }
        });

        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Import error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Error al importar' });
    }
});

// ============================================
// Allocations Endpoints (Planning Module)
// ============================================

app.get('/api/allocations', requireAuth, (req, res) => {
    const year = validateYear(req.query.year);
    const week = validateWeek(req.query.week);
    // Enforce area access based on user's assigned area
    const id_area = getEnforcedAreaId(req, validateId(req.query.id_area));
    const region_id = validateId(req.query.region_id);
    const pais_id = validateId(req.query.pais_id);

    if (!year || !week) {
        return res.status(400).json({ error: 'Año y semana son requeridos' });
    }

    let sql = `
        SELECT
            a.*,
            c.name as colaborador_name,
            cl.name as cliente_name,
            p.name as proyecto_name,
            t.name as tipo_name,
            ar.name as area_name,
            r.name as region_name,
            pa.name as pais_name
        FROM allocations a
        JOIN colaboradores c ON a.colaborador_id = c.id
        JOIN clientes cl ON a.cliente_id = cl.id
        LEFT JOIN proyectos p ON cl.id_proyecto = p.id
        LEFT JOIN tipo_proyecto t ON cl.id_tipo_proyecto = t.id
        LEFT JOIN areas ar ON a.id_area = ar.id
        LEFT JOIN regiones r ON a.region_id = r.id
        LEFT JOIN paises pa ON a.pais_id = pa.id
        WHERE a.year = ? AND a.week_number = ?
    `;
    const params = [year, week];

    if (id_area) {
        sql += ' AND a.id_area = ?';
        params.push(id_area);
    }
    if (region_id) {
        sql += ' AND a.region_id = ?';
        params.push(region_id);
    }
    if (pais_id) {
        sql += ' AND a.pais_id = ?';
        params.push(pais_id);
    }

    sql += ' ORDER BY c.name, a.date';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.get('/api/allocations/weeks', requireAuth, (req, res) => {
    const year = validateYear(req.query.year);
    const sql = year
        ? 'SELECT DISTINCT year, week_number FROM allocations WHERE year = ? ORDER BY year DESC, week_number DESC'
        : 'SELECT DISTINCT year, week_number FROM allocations ORDER BY year DESC, week_number DESC';
    const params = year ? [year] : [];
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/allocations', requireAdmin, (req, res) => {
    const colaborador_id = validateId(req.body.colaborador_id);
    const cliente_id = validateId(req.body.cliente_id);
    const date = validateDate(req.body.date);
    const hours = validateHours(req.body.hours);
    const week_number = validateWeek(req.body.week_number);
    const year = validateYear(req.body.year);
    const id_area = validateId(req.body.id_area);
    // Handle region_id and pais_id - convert null/undefined/empty to null for PostgreSQL
    const region_id = req.body.region_id !== null && req.body.region_id !== undefined && req.body.region_id !== ''
        ? validateId(req.body.region_id)
        : null;
    const pais_id = req.body.pais_id !== null && req.body.pais_id !== undefined && req.body.pais_id !== ''
        ? validateId(req.body.pais_id)
        : null;

    console.log('[POST /api/allocations] Received:', { colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id });

    if (!colaborador_id || !cliente_id || !date || hours === null || !week_number || !year) {
        return res.status(400).json({ error: 'Datos inválidos o incompletos' });
    }

    db.run(
        `INSERT INTO allocations (colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id],
        function(err) {
            if (err) {
                console.error('[POST /api/allocations] Error:', err.message);
                return res.status(500).json({ error: 'Error del servidor', details: err.message });
            }
            res.json({ message: 'Asignación creada', id: this.lastID });
        }
    );
});

app.put('/api/allocations/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const colaborador_id = validateId(req.body.colaborador_id);
    const cliente_id = validateId(req.body.cliente_id);
    const date = validateDate(req.body.date);
    const hours = validateHours(req.body.hours);
    const week_number = validateWeek(req.body.week_number);
    const year = validateYear(req.body.year);
    const id_area = req.body.id_area === null || req.body.id_area === '' ? null : validateId(req.body.id_area);
    // Handle region_id and pais_id - convert null/undefined/empty to null for PostgreSQL
    const region_id = req.body.region_id !== null && req.body.region_id !== undefined && req.body.region_id !== ''
        ? validateId(req.body.region_id)
        : null;
    const pais_id = req.body.pais_id !== null && req.body.pais_id !== undefined && req.body.pais_id !== ''
        ? validateId(req.body.pais_id)
        : null;

    console.log('[PUT /api/allocations] Received:', { id, colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id });

    if (!colaborador_id || !cliente_id || !date || hours === null || !week_number || !year) {
        return res.status(400).json({ error: 'Datos inválidos o incompletos' });
    }

    db.run(
        `UPDATE allocations
         SET colaborador_id = ?, cliente_id = ?, date = ?, hours = ?, week_number = ?, year = ?, id_area = ?, region_id = ?, pais_id = ?
         WHERE id = ?`,
        [colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id, id],
        function(err) {
            if (err) {
                console.error('[PUT /api/allocations] Error:', err.message);
                return res.status(500).json({ error: 'Error del servidor', details: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Asignación no encontrada' });
            }
            res.json({ message: 'Asignación actualizada', id, changes: this.changes });
        }
    );
});

app.post('/api/allocations/copy', requireAdmin, (req, res) => {
    const fromYear = validateYear(req.body.fromYear);
    const fromWeek = validateWeek(req.body.fromWeek);
    const toYear = validateYear(req.body.toYear);
    const toWeek = validateWeek(req.body.toWeek);
    const id_area = validateId(req.body.id_area);
    const region_id = validateId(req.body.region_id);
    const pais_id = validateId(req.body.pais_id);

    if (!fromYear || !fromWeek || !toYear || !toWeek) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    let selectSql = `
        SELECT colaborador_id, cliente_id, date, hours, id_area, region_id, pais_id
        FROM allocations
        WHERE year = ? AND week_number = ?
    `;
    const selectParams = [fromYear, fromWeek];
    if (id_area) {
        selectSql += ' AND id_area = ?';
        selectParams.push(id_area);
    }
    if (region_id) {
        selectSql += ' AND region_id = ?';
        selectParams.push(region_id);
    }
    if (pais_id) {
        selectSql += ' AND pais_id = ?';
        selectParams.push(pais_id);
    }
    selectSql += ' ORDER BY date, colaborador_id';

    db.all(selectSql, selectParams, (err, sourceAllocations) => {
        if (err) {
            return res.status(500).json({ error: 'Error del servidor' });
        }

        if (sourceAllocations.length === 0) {
            return res.status(404).json({ error: `No se encontraron asignaciones para la semana ${fromWeek}/${fromYear}` });
        }

        function getDateOfISOWeek(w, y) {
            const simple = new Date(y, 0, 1 + (w - 1) * 7);
            const dow = simple.getDay();
            const ISOweekStart = new Date(simple);
            if (dow <= 4) {
                ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
            } else {
                ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
            }
            return ISOweekStart;
        }

        const sourceMonday = getDateOfISOWeek(fromWeek, fromYear);
        const targetMonday = getDateOfISOWeek(toWeek, toYear);
        const dayDifference = Math.round((targetMonday - sourceMonday) / (1000 * 60 * 60 * 24));

        let insertedCount = 0;
        let errors = [];

        sourceAllocations.forEach(alloc => {
            const sourceDate = new Date(alloc.date + 'T00:00:00');
            const targetDate = new Date(sourceDate);
            targetDate.setDate(sourceDate.getDate() + dayDifference);
            const dateStr = targetDate.toISOString().split('T')[0];

            db.run(
                `INSERT INTO allocations (colaborador_id, cliente_id, date, hours, week_number, year, id_area, region_id, pais_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [alloc.colaborador_id, alloc.cliente_id, dateStr, alloc.hours, toWeek, toYear, alloc.id_area, alloc.region_id, alloc.pais_id],
                function(err) {
                    if (err) {
                        errors.push(err.message);
                    } else {
                        insertedCount++;
                    }
                }
            );
        });

        // Use setTimeout to wait for async operations
        setTimeout(() => {
            if (errors.length > 0) {
                return res.status(500).json({
                    error: 'Algunos registros no se pudieron copiar',
                    inserted: insertedCount
                });
            }
            res.json({
                message: `Copiadas ${insertedCount} asignaciones`,
                sourceCount: sourceAllocations.length,
                insertedCount: insertedCount
            });
        }, 100);
    });
});

app.delete('/api/allocations/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM allocations WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Asignación eliminada', changes: this.changes });
    });
});

app.delete('/api/allocations/collaborator/:colaborador_id/week/:year/:week', requireAdmin, (req, res) => {
    const colaborador_id = validateId(req.params.colaborador_id);
    const year = validateYear(req.params.year);
    const week = validateWeek(req.params.week);
    const id_area = req.query.id_area ? validateId(req.query.id_area) : null;
    const region_id = req.query.region_id ? validateId(req.query.region_id) : null;
    const pais_id = req.query.pais_id ? validateId(req.query.pais_id) : null;

    if (!colaborador_id || !year || !week) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Build query with optional filters
    let sql = 'DELETE FROM allocations WHERE colaborador_id = ? AND year = ? AND week_number = ?';
    const params = [colaborador_id, year, week];

    if (id_area) {
        sql += ' AND id_area = ?';
        params.push(id_area);
    }

    if (region_id) {
        sql += ' AND region_id = ?';
        params.push(region_id);
    }

    if (pais_id) {
        sql += ' AND pais_id = ?';
        params.push(pais_id);
    }

    db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({
                message: `Eliminadas ${this.changes} asignaciones`,
                changes: this.changes
            });
        }
    );
});

app.delete('/api/allocations/week/:year/:week', requireAdmin, (req, res) => {
    const year = validateYear(req.params.year);
    const week = validateWeek(req.params.week);
    const id_area = req.query.id_area ? validateId(req.query.id_area) : null;
    const region_id = req.query.region_id ? validateId(req.query.region_id) : null;
    const pais_id = req.query.pais_id ? validateId(req.query.pais_id) : null;

    if (!year || !week) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    // Build query with optional filters
    let sql = 'DELETE FROM allocations WHERE year = ? AND week_number = ?';
    const params = [year, week];

    if (id_area) {
        sql += ' AND id_area = ?';
        params.push(id_area);
    }

    if (region_id) {
        sql += ' AND region_id = ?';
        params.push(region_id);
    }

    if (pais_id) {
        sql += ' AND pais_id = ?';
        params.push(pais_id);
    }

    db.run(sql, params, function(err) {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({
                message: `Eliminada toda la planificación (${this.changes} asignaciones)`,
                changes: this.changes
            });
        }
    );
});

// Delete allocations for a specific collaborator on a specific day
app.delete('/api/allocations/collaborator-day/:colaborador_id/:date', requireAdmin, (req, res) => {
    const colaborador_id = validateId(req.params.colaborador_id);
    const date = validateDate(req.params.date);
    const id_area = req.query.id_area ? validateId(req.query.id_area) : null;

    if (!colaborador_id || !date) {
        return res.status(400).json({ error: 'Datos inválidos' });
    }

    let sql = 'DELETE FROM allocations WHERE colaborador_id = ? AND date = ?';
    const params = [colaborador_id, date];

    if (id_area) {
        sql += ' AND id_area = ?';
        params.push(id_area);
    }

    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({
            message: `Eliminadas ${this.changes} asignaciones`,
            changes: this.changes
        });
    });
});

// ============================================
// Dashboard Analytics Endpoint
// ============================================

app.get('/api/dashboard/analytics', requireAuth, async (req, res) => {
    const startDate = validateDate(req.query.startDate);
    const endDate = validateDate(req.query.endDate);
    // Enforce area access based on user's assigned area
    const id_area = getEnforcedAreaId(req, validateId(req.query.id_area));
    const region_id = validateId(req.query.region_id);
    const pais_id = validateId(req.query.pais_id);

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'Fechas de inicio y fin son requeridas' });
    }

    // Build dynamic filter clauses for allocations table
    let filterClauses = [];
    let baseParams = [startDate, endDate];

    if (id_area) {
        filterClauses.push('a.id_area = ?');
        baseParams.push(id_area);
    }
    if (region_id) {
        filterClauses.push('a.region_id = ?');
        baseParams.push(region_id);
    }
    if (pais_id) {
        filterClauses.push('a.pais_id = ?');
        baseParams.push(pais_id);
    }

    const filterSQL = filterClauses.length > 0 ? ' AND ' + filterClauses.join(' AND ') : '';

    try {
        const analytics = {
            kpis: {},
            projectTypeDistribution: [],
            collaboratorHours: []
        };

        const dbGet = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };

        const dbAll = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        const totalHoursResult = await dbGet(
            `SELECT SUM(hours) as total_hours FROM allocations a WHERE date BETWEEN ? AND ?${filterSQL}`,
            baseParams
        );
        analytics.kpis.totalHours = parseFloat((totalHoursResult?.total_hours || 0).toFixed(1));

        const activeProjectsResult = await dbGet(
            `SELECT COUNT(DISTINCT a.cliente_id) as active_projects
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             INNER JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ? AND tp.name != 'Otro'${filterSQL}`,
            baseParams
        );
        analytics.kpis.activeProjects = activeProjectsResult?.active_projects || 0;

        // Build subquery filter for complex queries
        let subFilterClauses = [];
        let subParams = [startDate, endDate];
        if (id_area) { subFilterClauses.push('sub.id_area = ?'); subParams.push(id_area); }
        if (region_id) { subFilterClauses.push('sub.region_id = ?'); subParams.push(region_id); }
        if (pais_id) { subFilterClauses.push('sub.pais_id = ?'); subParams.push(pais_id); }
        const subFilterSQL = subFilterClauses.length > 0 ? ' AND ' + subFilterClauses.join(' AND ') : '';

        // Count active collaborators excluding those who ONLY have vacation assignments (id_proyecto=4)
        // A collaborator is excluded only if ALL their allocations in the range are for vacation clients
        const activeCollabsResult = await dbGet(
            `SELECT COUNT(DISTINCT a.colaborador_id) as active_collaborators
             FROM allocations a
             WHERE a.date BETWEEN ? AND ?${filterSQL}
             AND a.colaborador_id NOT IN (
                 SELECT sub.colaborador_id
                 FROM allocations sub
                 INNER JOIN clientes c ON sub.cliente_id = c.id
                 WHERE sub.date BETWEEN ? AND ?${subFilterSQL}
                 GROUP BY sub.colaborador_id
                 HAVING COUNT(DISTINCT CASE WHEN c.id_proyecto = 4 THEN sub.cliente_id END) = COUNT(DISTINCT sub.cliente_id)
             )`,
            [...baseParams, ...subParams]
        );
        analytics.kpis.activeCollaborators = activeCollabsResult?.active_collaborators || 0;

        const avgAllocation = analytics.kpis.activeCollaborators > 0
            ? (analytics.kpis.totalHours / analytics.kpis.activeCollaborators).toFixed(1)
            : 0;
        analytics.kpis.averageAllocation = parseFloat(avgAllocation);

        const vacationResult = await dbGet(
            `SELECT COUNT(DISTINCT a.colaborador_id) as vacation_collaborators
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ?
             AND c.id_proyecto = 4${filterSQL}`,
            baseParams
        );
        analytics.kpis.vacationCollaborators = vacationResult?.vacation_collaborators || 0;

        const trainingResult = await dbGet(
            `SELECT COUNT(DISTINCT a.colaborador_id) as training_collaborators
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ?
             AND c.name IN ('DEV/DCM', 'DEV', 'DCM')${filterSQL}`,
            baseParams
        );
        analytics.kpis.trainingCollaborators = trainingResult?.training_collaborators || 0;

        const trainingHoursResult = await dbGet(
            `SELECT SUM(a.hours) as training_hours
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ?
             AND c.name IN ('DEV/DCM', 'DEV', 'DCM')${filterSQL}`,
            baseParams
        );
        analytics.kpis.trainingHours = parseFloat((trainingHoursResult?.training_hours || 0).toFixed(1));

        const projectTypeRows = await dbAll(
            `SELECT tp.name as type, SUM(a.hours) as hours
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             INNER JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ?${filterSQL}
             GROUP BY tp.id, tp.name
             ORDER BY hours DESC`,
            baseParams
        );

        const totalHours = projectTypeRows.reduce((sum, row) => sum + (row.hours || 0), 0);
        analytics.projectTypeDistribution = projectTypeRows.map(row => ({
            type: row.type,
            hours: parseFloat((row.hours || 0).toFixed(1)),
            percentage: totalHours > 0 ? ((row.hours / totalHours) * 100).toFixed(1) : 0
        }));

        const collaboratorRows = await dbAll(
            `SELECT
                col.name as collaborator,
                c.name as client,
                tp.name as type,
                SUM(a.hours) as hours
             FROM allocations a
             INNER JOIN colaboradores col ON a.colaborador_id = col.id
             INNER JOIN clientes c ON a.cliente_id = c.id
             LEFT JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ?${filterSQL}
             GROUP BY col.id, col.name, c.id, c.name, tp.name
             ORDER BY col.name, hours DESC`,
            baseParams
        );

        const collaboratorMap = {};
        collaboratorRows.forEach(row => {
            if (!collaboratorMap[row.collaborator]) {
                collaboratorMap[row.collaborator] = {
                    collaborator: row.collaborator,
                    projects: []
                };
            }
            collaboratorMap[row.collaborator].projects.push({
                client: row.client,
                type: row.type,
                hours: parseFloat((row.hours || 0).toFixed(1))
            });
        });

        analytics.collaboratorHours = Object.values(collaboratorMap);
        res.json(analytics);

    } catch (error) {
        console.error('[Analytics] Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// REGIONES Endpoints
// ============================================

app.get('/api/config/regiones', requireAuth, (req, res) => {
    db.all('SELECT * FROM regiones ORDER BY es_global DESC, name', (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/regiones', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    const es_global = req.body.es_global === true || req.body.es_global === 'true';

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('INSERT INTO regiones (name, es_global) VALUES (?, ?)', [name, es_global], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE')) {
                return res.status(400).json({ error: 'La región ya existe' });
            }
            return res.status(500).json({ error: 'Error del servidor' });
        }
        res.json({ id: this.lastID, name, es_global });
    });
});

app.put('/api/config/regiones/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    const es_global = req.body.es_global === true || req.body.es_global === 'true';

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('UPDATE regiones SET name = ?, es_global = ? WHERE id = ?', [name, es_global, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Actualizado correctamente' });
    });
});

app.delete('/api/config/regiones/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM regiones WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/regiones/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM regiones WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// ============================================
// PAÍSES Endpoints
// ============================================

app.get('/api/config/paises', requireAuth, (req, res) => {
    const region_id = validateId(req.query.region_id);
    let sql = `
        SELECT p.*, r.name as region_name
        FROM paises p
        LEFT JOIN regiones r ON p.region_id = r.id
    `;
    const params = [];

    if (region_id) {
        sql += ' WHERE p.region_id = ?';
        params.push(region_id);
    }

    sql += ' ORDER BY p.es_global DESC, r.name, p.name';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.post('/api/config/paises', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    const region_id = validateId(req.body.region_id);
    const es_global = req.body.es_global === true || req.body.es_global === 'true';

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    if (!region_id) {
        return res.status(400).json({ error: 'Debe seleccionar una región' });
    }

    db.run('INSERT INTO paises (name, region_id, es_global) VALUES (?, ?, ?)',
        [name, region_id, es_global], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El país ya existe en esta región' });
                }
                return res.status(500).json({ error: 'Error del servidor' });
            }
            res.json({ id: this.lastID, name, region_id, es_global });
        });
});

app.put('/api/config/paises/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    const region_id = validateId(req.body.region_id);
    const es_global = req.body.es_global === true || req.body.es_global === 'true';

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('UPDATE paises SET name = ?, region_id = ?, es_global = ? WHERE id = ?',
        [name, region_id, es_global, id], (err) => {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({ message: 'Actualizado correctamente' });
        });
});

app.delete('/api/config/paises/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    db.run('DELETE FROM paises WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Eliminado correctamente' });
    });
});

app.post('/api/config/paises/bulk-delete', requireAdmin, (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const validIds = ids.map(validateId).filter(id => id !== null);
    if (validIds.length === 0) {
        return res.status(400).json({ error: 'IDs inválidos' });
    }

    const placeholders = validIds.map(() => '?').join(',');
    db.run(`DELETE FROM paises WHERE id IN (${placeholders})`, validIds, (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: `Eliminados ${validIds.length} registros` });
    });
});

// ============================================
// Update ÁREAS Endpoints (with region/pais)
// ============================================

// Override areas GET to include region and country names
app.get('/api/config/areas/full', requireAuth, (req, res) => {
    const region_id = validateId(req.query.region_id);
    const pais_id = validateId(req.query.pais_id);

    let sql = `
        SELECT a.*, r.name as region_name, p.name as pais_name
        FROM areas a
        LEFT JOIN regiones r ON a.region_id = r.id
        LEFT JOIN paises p ON a.pais_id = p.id
        WHERE 1=1
    `;
    const params = [];

    if (region_id) {
        sql += ' AND a.region_id = ?';
        params.push(region_id);
    }

    if (pais_id) {
        sql += ' AND a.pais_id = ?';
        params.push(pais_id);
    }

    sql += ' ORDER BY r.name, p.name, a.name';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

// Update areas PUT to include region and country
app.put('/api/config/areas/:id/full', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const name = sanitizeString(req.body.name);
    const region_id = validateId(req.body.region_id);
    const pais_id = validateId(req.body.pais_id);

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('UPDATE areas SET name = ?, region_id = ?, pais_id = ? WHERE id = ?',
        [name, region_id, pais_id, id], (err) => {
            if (err) return res.status(500).json({ error: 'Error del servidor' });
            res.json({ message: 'Actualizado correctamente' });
        });
});

// Add area with region and country
app.post('/api/config/areas/full', requireAdmin, (req, res) => {
    const name = sanitizeString(req.body.name);
    const region_id = validateId(req.body.region_id);
    const pais_id = validateId(req.body.pais_id);

    if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nombre inválido (2-100 caracteres)' });
    }

    db.run('INSERT INTO areas (name, region_id, pais_id) VALUES (?, ?, ?)',
        [name, region_id, pais_id], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(400).json({ error: 'El área ya existe en esta ubicación' });
                }
                return res.status(500).json({ error: 'Error del servidor' });
            }
            res.json({ id: this.lastID, name, region_id, pais_id });
        });
});

// ============================================
// COR Integration Endpoints
// ============================================

// COR Configuration
app.get('/api/cor/config', requireAdmin, (req, res) => {
    db.get('SELECT * FROM config_cor WHERE id = 1', (err, row) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        // Hide sensitive data partially
        if (row && row.api_key) {
            row.api_key_masked = row.api_key.substring(0, 8) + '****';
        }
        if (row && row.client_secret) {
            row.client_secret_masked = '****' + row.client_secret.substring(row.client_secret.length - 4);
        }
        res.json(row || {});
    });
});

app.put('/api/cor/config', requireAdmin, (req, res) => {
    const api_key = req.body.api_key || null;
    const client_secret = req.body.client_secret || null;
    const intervalo_sync_horas = parseInt(req.body.intervalo_sync_horas) || 24;
    const sync_automatica = req.body.sync_automatica === true || req.body.sync_automatica === 'true';

    db.run(`
        UPDATE config_cor
        SET api_key = COALESCE(?, api_key),
            client_secret = COALESCE(?, client_secret),
            intervalo_sync_horas = ?,
            sync_automatica = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = 1
    `, [api_key, client_secret, intervalo_sync_horas, sync_automatica], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Configuración actualizada' });
    });
});

// COR Project Mapping
app.get('/api/cor/mapeo-proyectos', requireAuth, (req, res) => {
    db.all(`
        SELECT m.*, c.name as cliente_name
        FROM mapeo_proyectos_cor m
        LEFT JOIN clientes c ON m.cliente_id = c.id
        ORDER BY m.cor_project_name
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.put('/api/cor/mapeo-proyectos/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const cliente_id = validateId(req.body.cliente_id);

    db.run(`
        UPDATE mapeo_proyectos_cor
        SET cliente_id = ?, vinculacion_automatica = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [cliente_id, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Mapeo actualizado' });
    });
});

// COR User Mapping
app.get('/api/cor/mapeo-usuarios', requireAuth, (req, res) => {
    db.all(`
        SELECT m.*, col.name as colaborador_name
        FROM mapeo_usuarios_cor m
        LEFT JOIN colaboradores col ON m.colaborador_id = col.id
        ORDER BY m.cor_user_name
    `, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

app.put('/api/cor/mapeo-usuarios/:id', requireAdmin, (req, res) => {
    const id = validateId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    const colaborador_id = validateId(req.body.colaborador_id);

    db.run(`
        UPDATE mapeo_usuarios_cor
        SET colaborador_id = ?, vinculacion_automatica = FALSE, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, [colaborador_id, id], (err) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json({ message: 'Mapeo actualizado' });
    });
});

// COR Real Hours
app.get('/api/cor/horas-reales', requireAuth, (req, res) => {
    const year = validateYear(req.query.year);
    const week = validateWeek(req.query.week);
    const id_area = getEnforcedAreaId(req, validateId(req.query.id_area));

    let sql = `
        SELECT h.*,
               col.name as colaborador_name,
               c.name as cliente_name
        FROM horas_reales_cor h
        LEFT JOIN colaboradores col ON h.colaborador_id = col.id
        LEFT JOIN clientes c ON h.cliente_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (year) {
        sql += ' AND h.year = ?';
        params.push(year);
    }

    if (week) {
        sql += ' AND h.week_number = ?';
        params.push(week);
    }

    if (id_area) {
        sql += ' AND (col.id_area = ? OR c.id_area = ?)';
        params.push(id_area, id_area);
    }

    sql += ' ORDER BY h.fecha DESC, col.name';

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'Error del servidor' });
        res.json(rows);
    });
});

// COR Analytics: Real vs Planned comparison
app.get('/api/cor/comparativo', requireAuth, async (req, res) => {
    const id_area = getEnforcedAreaId(req, validateId(req.query.id_area));
    const region_id = validateId(req.query.region_id);
    const pais_id = validateId(req.query.pais_id);
    const fecha_desde = req.query.fecha_desde; // YYYY-MM-DD format
    const fecha_hasta = req.query.fecha_hasta; // YYYY-MM-DD format

    try {
        const dbAll = (sql, params) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        let dateFilter = '';
        let areaFilter = '';
        let regionFilter = '';
        let paisFilter = '';
        const params = [];

        // Date range filter
        if (fecha_desde && fecha_hasta) {
            dateFilter = ' AND a.date >= ? AND a.date <= ?';
            params.push(fecha_desde, fecha_hasta);
        } else if (fecha_desde) {
            dateFilter = ' AND a.date >= ?';
            params.push(fecha_desde);
        } else if (fecha_hasta) {
            dateFilter = ' AND a.date <= ?';
            params.push(fecha_hasta);
        }

        if (id_area) {
            areaFilter = ' AND a.id_area = ?';
            params.push(id_area);
        }
        if (region_id) {
            regionFilter = ' AND a.region_id = ?';
            params.push(region_id);
        }
        if (pais_id) {
            paisFilter = ' AND a.pais_id = ?';
            params.push(pais_id);
        }

        // Planned hours from allocations - grouped by client only (not by week)
        const plannedSql = `
            SELECT
                col.id as colaborador_id,
                col.name as colaborador_name,
                c.id as cliente_id,
                c.name as cliente_name,
                a.date,
                SUM(a.hours) as horas_planificadas
            FROM allocations a
            INNER JOIN colaboradores col ON a.colaborador_id = col.id
            INNER JOIN clientes c ON a.cliente_id = c.id
            WHERE 1=1
            ${dateFilter}
            ${areaFilter}
            ${regionFilter}
            ${paisFilter}
            GROUP BY col.id, col.name, c.id, c.name, a.date
        `;

        // Real hours from COR
        let realDateFilter = '';
        let realAreaFilter = '';
        let realRegionFilter = '';
        let realPaisFilter = '';
        const realParams = [];

        if (fecha_desde && fecha_hasta) {
            realDateFilter = ' AND h.fecha >= ? AND h.fecha <= ?';
            realParams.push(fecha_desde, fecha_hasta);
        } else if (fecha_desde) {
            realDateFilter = ' AND h.fecha >= ?';
            realParams.push(fecha_desde);
        } else if (fecha_hasta) {
            realDateFilter = ' AND h.fecha <= ?';
            realParams.push(fecha_hasta);
        }

        if (id_area) {
            realAreaFilter = ' AND (col.id_area = ? OR c.id_area = ?)';
            realParams.push(id_area, id_area);
        }
        if (region_id) {
            realRegionFilter = ' AND c.region_id = ?';
            realParams.push(region_id);
        }
        if (pais_id) {
            realPaisFilter = ' AND c.pais_id = ?';
            realParams.push(pais_id);
        }

        const realSql = `
            SELECT
                col.id as colaborador_id,
                col.name as colaborador_name,
                c.id as cliente_id,
                c.name as cliente_name,
                h.fecha as date,
                SUM(h.horas) as horas_reales
            FROM horas_reales_cor h
            LEFT JOIN colaboradores col ON h.colaborador_id = col.id
            LEFT JOIN clientes c ON h.cliente_id = c.id
            WHERE 1=1
            ${realDateFilter}
            ${realAreaFilter}
            ${realRegionFilter}
            ${realPaisFilter}
            GROUP BY col.id, col.name, c.id, c.name, h.fecha
        `;

        const [planned, real] = await Promise.all([
            dbAll(plannedSql, params),
            dbAll(realSql, realParams)
        ]);

        // Combine data by date
        const combined = {};

        planned.forEach(row => {
            const key = `${row.colaborador_id}-${row.cliente_id}-${row.date}`;
            combined[key] = {
                colaborador_id: row.colaborador_id,
                colaborador_name: row.colaborador_name,
                cliente_id: row.cliente_id,
                cliente_name: row.cliente_name,
                date: row.date,
                horas_planificadas: parseFloat(row.horas_planificadas || 0),
                horas_reales: 0,
                diferencia: 0,
                cumplimiento: 0
            };
        });

        real.forEach(row => {
            const key = `${row.colaborador_id}-${row.cliente_id}-${row.date}`;
            if (combined[key]) {
                combined[key].horas_reales = parseFloat(row.horas_reales || 0);
            } else {
                combined[key] = {
                    colaborador_id: row.colaborador_id,
                    colaborador_name: row.colaborador_name,
                    cliente_id: row.cliente_id,
                    cliente_name: row.cliente_name,
                    date: row.date,
                    horas_planificadas: 0,
                    horas_reales: parseFloat(row.horas_reales || 0),
                    diferencia: 0,
                    cumplimiento: 0
                };
            }
        });

        // Calculate differences and compliance
        Object.values(combined).forEach(item => {
            item.diferencia = parseFloat((item.horas_reales - item.horas_planificadas).toFixed(1));
            item.cumplimiento = item.horas_planificadas > 0
                ? parseFloat(((item.horas_reales / item.horas_planificadas) * 100).toFixed(1))
                : (item.horas_reales > 0 ? 100 : 0);
        });

        const detalleArray = Object.values(combined);

        // Summary stats
        const totals = detalleArray.reduce((acc, item) => {
            acc.planificadas += item.horas_planificadas;
            acc.reales += item.horas_reales;
            return acc;
        }, { planificadas: 0, reales: 0 });

        totals.diferencia = parseFloat((totals.reales - totals.planificadas).toFixed(1));
        totals.cumplimiento = totals.planificadas > 0
            ? parseFloat(((totals.reales / totals.planificadas) * 100).toFixed(1))
            : 0;

        // Aggregated data for charts
        // Por Cliente (for horizontal bar chart)
        const porCliente = {};
        detalleArray.forEach(item => {
            const key = item.cliente_id || 'sin_cliente';
            if (!porCliente[key]) {
                porCliente[key] = {
                    cliente_id: item.cliente_id,
                    cliente_name: item.cliente_name || 'Sin Cliente',
                    planificadas: 0,
                    reales: 0
                };
            }
            porCliente[key].planificadas += item.horas_planificadas;
            porCliente[key].reales += item.horas_reales;
        });

        Object.values(porCliente).forEach(c => {
            c.diferencia = parseFloat((c.reales - c.planificadas).toFixed(1));
            c.varianza_pct = c.planificadas > 0
                ? parseFloat((((c.reales - c.planificadas) / c.planificadas) * 100).toFixed(1))
                : 0;
        });

        // Por Colaborador
        const porColaborador = {};
        detalleArray.forEach(item => {
            const key = item.colaborador_id || 'sin_colaborador';
            if (!porColaborador[key]) {
                porColaborador[key] = {
                    colaborador_id: item.colaborador_id,
                    colaborador_name: item.colaborador_name || 'Sin Colaborador',
                    planificadas: 0,
                    reales: 0
                };
            }
            porColaborador[key].planificadas += item.horas_planificadas;
            porColaborador[key].reales += item.horas_reales;
        });

        Object.values(porColaborador).forEach(c => {
            c.diferencia = parseFloat((c.reales - c.planificadas).toFixed(1));
            c.varianza_pct = c.planificadas > 0
                ? parseFloat((((c.reales - c.planificadas) / c.planificadas) * 100).toFixed(1))
                : 0;
        });

        // Por Día (for trend chart)
        const porDia = {};
        detalleArray.forEach(item => {
            const key = item.date;
            if (!porDia[key]) {
                porDia[key] = {
                    date: item.date,
                    planificadas: 0,
                    reales: 0
                };
            }
            porDia[key].planificadas += item.horas_planificadas;
            porDia[key].reales += item.horas_reales;
        });

        Object.values(porDia).forEach(s => {
            s.diferencia = parseFloat((s.reales - s.planificadas).toFixed(1));
            s.varianza_pct = s.planificadas > 0
                ? parseFloat((((s.reales - s.planificadas) / s.planificadas) * 100).toFixed(1))
                : 0;
        });

        // Por Mes (for monthly bar chart)
        const porMes = {};
        detalleArray.forEach(item => {
            const mes = String(item.date).substring(0, 7);
            if (!porMes[mes]) {
                porMes[mes] = { mes, planificadas: 0, reales: 0 };
            }
            porMes[mes].planificadas += item.horas_planificadas;
            porMes[mes].reales += item.horas_reales;
        });

        // Heatmap data: Cliente x Mes con cumplimiento
        const heatmapData = {};
        detalleArray.forEach(item => {
            const mes = String(item.date).substring(0, 7);
            const clienteKey = item.cliente_id || 'sin_cliente';
            if (!heatmapData[clienteKey]) {
                heatmapData[clienteKey] = {
                    cliente_id: item.cliente_id,
                    cliente_name: item.cliente_name || 'Sin Cliente',
                    meses: {}
                };
            }
            if (!heatmapData[clienteKey].meses[mes]) {
                heatmapData[clienteKey].meses[mes] = { planificadas: 0, reales: 0 };
            }
            heatmapData[clienteKey].meses[mes].planificadas += item.horas_planificadas;
            heatmapData[clienteKey].meses[mes].reales += item.horas_reales;
        });

        // Scatter data for efficiency plot
        const scatterData = Object.values(porCliente).map(c => ({
            x: c.planificadas,
            y: c.reales,
            label: c.cliente_name,
            cliente_id: c.cliente_id
        }));

        // KPIs adicionales
        const clientesEficientes = Object.values(porCliente).filter(c => c.varianza_pct >= -10 && c.varianza_pct <= 10).length;
        const clientesSobrepasados = Object.values(porCliente).filter(c => c.varianza_pct > 10).length;
        const clientesSubutilizados = Object.values(porCliente).filter(c => c.varianza_pct < -10).length;

        const precision = totals.planificadas > 0
            ? parseFloat((100 - Math.abs(totals.cumplimiento - 100)).toFixed(1))
            : 0;

        res.json({
            detalle: detalleArray,
            resumen: totals,
            porCliente: Object.values(porCliente).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
            porColaborador: Object.values(porColaborador).sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)),
            porDia: Object.values(porDia).sort((a, b) => String(a.date).localeCompare(String(b.date))),
            porMes: Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)),
            heatmapData: Object.values(heatmapData),
            scatterData,
            kpis: {
                precision,
                clientesEficientes,
                clientesSobrepasados,
                clientesSubutilizados,
                totalClientes: Object.keys(porCliente).length
            }
        });

    } catch (error) {
        console.error('[Comparativo] Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// CSV Import for COR hours (temporary until API is available)
app.post('/api/cor/importar-horas-csv', requireAdmin, upload.single('file'), handleUploadError, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const lines = content.trim().split('\n').filter(l => l.trim());

        if (lines.length < 2) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'El archivo debe tener al menos una fila de datos' });
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

        // Expected columns: fecha, colaborador, cliente, horas
        const fechaIdx = headers.findIndex(h => h.includes('fecha'));
        const colabIdx = headers.findIndex(h => h.includes('colaborador') || h.includes('usuario'));
        const clienteIdx = headers.findIndex(h => h.includes('cliente') || h.includes('proyecto'));
        const horasIdx = headers.findIndex(h => h.includes('hora'));

        if (fechaIdx === -1 || colabIdx === -1 || horasIdx === -1) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                error: 'El CSV debe tener columnas: fecha, colaborador/usuario, horas'
            });
        }

        // Helper functions for async DB operations
        const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
        const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
            db.run(sql, params, function(err) { err ? reject(err) : resolve(this); });
        });

        // Load colaboradores and clientes for name matching
        const colaboradores = await dbAll('SELECT id, name FROM colaboradores');
        const clientes = await dbAll('SELECT id, name FROM clientes');

        // Create lookup maps (lowercase name -> id)
        const colabMap = {};
        colaboradores.forEach(c => { colabMap[c.name.toLowerCase().trim()] = c.id; });
        const clienteMap = {};
        clientes.forEach(c => { clienteMap[c.name.toLowerCase().trim()] = c.id; });

        // Function to calculate ISO week number
        const getWeekNumber = (date) => {
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        };

        let count = 0;
        let errors = [];
        let colabNotFound = new Set();
        let clienteNotFound = new Set();

        // Process each line
        for (let idx = 1; idx < lines.length; idx++) {
            const line = lines[idx];
            const values = line.split(',').map(v => v.trim());
            const fecha = values[fechaIdx];
            const colaboradorName = values[colabIdx];
            const clienteName = clienteIdx >= 0 ? values[clienteIdx] : null;
            const horas = parseFloat(values[horasIdx]);

            if (!fecha || !colaboradorName || isNaN(horas)) {
                errors.push(`Línea ${idx + 1}: datos incompletos`);
                continue;
            }

            // Parse and validate date
            const dateObj = new Date(fecha + 'T00:00:00');
            if (isNaN(dateObj.getTime())) {
                errors.push(`Línea ${idx + 1}: fecha inválida '${fecha}'`);
                continue;
            }

            // Find colaborador ID
            const colaboradorId = colabMap[colaboradorName.toLowerCase().trim()];
            if (!colaboradorId) {
                colabNotFound.add(colaboradorName);
                errors.push(`Línea ${idx + 1}: colaborador '${colaboradorName}' no encontrado`);
                continue;
            }

            // Find cliente ID
            const clienteId = clienteName ? clienteMap[clienteName.toLowerCase().trim()] : null;
            if (clienteName && !clienteId) {
                clienteNotFound.add(clienteName);
                errors.push(`Línea ${idx + 1}: cliente '${clienteName}' no encontrado`);
                continue;
            }

            // Calculate week_number and year from date
            const year = dateObj.getFullYear();
            const week_number = getWeekNumber(dateObj);

            // Insert record
            try {
                await dbRun(`
                    INSERT INTO horas_reales_cor
                    (colaborador_id, cliente_id, fecha, horas, week_number, year, status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 'imported', CURRENT_TIMESTAMP)
                `, [colaboradorId, clienteId, fecha, horas, week_number, year]);
                count++;
            } catch (insertErr) {
                errors.push(`Línea ${idx + 1}: error al insertar - ${insertErr.message}`);
            }
        }

        fs.unlinkSync(req.file.path);

        // Build response
        let message = `Importados ${count} registros correctamente`;
        const response = { message, count };

        if (errors.length > 0) {
            response.message = `Importados ${count} registros con ${errors.length} errores`;
            response.errors = errors.slice(0, 20);
            if (colabNotFound.size > 0) {
                response.colaboradoresNoEncontrados = Array.from(colabNotFound);
            }
            if (clienteNotFound.size > 0) {
                response.clientesNoEncontrados = Array.from(clienteNotFound);
            }
        }

        res.json(response);

    } catch (error) {
        console.error('Import error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: 'Error al importar: ' + error.message });
    }
});

// Auto-link COR users to colaboradores by name similarity
app.post('/api/cor/auto-vincular-usuarios', requireAdmin, async (req, res) => {
    try {
        const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });

        // Get unlinked COR users
        const unlinkedUsers = await dbAll(`
            SELECT * FROM mapeo_usuarios_cor WHERE colaborador_id IS NULL
        `);

        // Get all colaboradores
        const colaboradores = await dbAll(`SELECT * FROM colaboradores`);

        let linked = 0;

        for (const corUser of unlinkedUsers) {
            // Try exact match first
            let match = colaboradores.find(c =>
                c.name.toLowerCase() === corUser.cor_user_name?.toLowerCase()
            );

            // Try partial match
            if (!match && corUser.cor_user_name) {
                const corParts = corUser.cor_user_name.toLowerCase().split(' ');
                match = colaboradores.find(c => {
                    const colabParts = c.name.toLowerCase().split(' ');
                    return corParts.some(p => colabParts.some(cp => cp.includes(p) || p.includes(cp)));
                });
            }

            if (match) {
                await dbRun(`
                    UPDATE mapeo_usuarios_cor
                    SET colaborador_id = ?, vinculacion_automatica = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [match.id, corUser.id]);
                linked++;
            }
        }

        res.json({ message: `Vinculados ${linked} usuarios automáticamente` });

    } catch (error) {
        console.error('[Auto-vincular] Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Auto-link COR projects to clientes by name similarity
app.post('/api/cor/auto-vincular-proyectos', requireAdmin, async (req, res) => {
    try {
        const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });

        // Get unlinked COR projects
        const unlinkedProjects = await dbAll(`
            SELECT * FROM mapeo_proyectos_cor WHERE cliente_id IS NULL
        `);

        // Get all clientes
        const clientes = await dbAll(`SELECT * FROM clientes`);

        let linked = 0;

        for (const corProject of unlinkedProjects) {
            // Try exact match first
            let match = clientes.find(c =>
                c.name.toLowerCase() === corProject.cor_project_name?.toLowerCase() ||
                c.name.toLowerCase() === corProject.cor_client_name?.toLowerCase()
            );

            // Try partial match
            if (!match && (corProject.cor_project_name || corProject.cor_client_name)) {
                const searchName = (corProject.cor_project_name || corProject.cor_client_name).toLowerCase();
                match = clientes.find(c => {
                    const clientName = c.name.toLowerCase();
                    return clientName.includes(searchName) || searchName.includes(clientName);
                });
            }

            if (match) {
                await dbRun(`
                    UPDATE mapeo_proyectos_cor
                    SET cliente_id = ?, vinculacion_automatica = TRUE, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [match.id, corProject.id]);
                linked++;
            }
        }

        res.json({ message: `Vinculados ${linked} proyectos automáticamente` });

    } catch (error) {
        console.error('[Auto-vincular] Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
