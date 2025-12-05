const { Pool } = require('pg');

// PostgreSQL connection using environment variable
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
function convertPlaceholders(sql) {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
}

// Schema for PostgreSQL - Complete with areas and id_area columns
const schema = `
-- ============================================
-- Database Schema for Resource Planning Application
-- LLYC Configuration Tables (PostgreSQL version)
-- ============================================

-- 0. Areas (Business Units - Master)
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default areas
INSERT INTO areas (name) VALUES ('Data Hub') ON CONFLICT (name) DO NOTHING;
INSERT INTO areas (name) VALUES ('Channel Lab') ON CONFLICT (name) DO NOTHING;

-- 1. Colaboradores (Workers)
CREATE TABLE IF NOT EXISTS colaboradores (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Proyectos (Project Categories - Master)
CREATE TABLE IF NOT EXISTS proyectos (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tipo de Proyecto (Project Types - Master)
CREATE TABLE IF NOT EXISTS tipo_proyecto (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Clientes (Clients with FK references)
CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    id_proyecto INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
    id_tipo_proyecto INTEGER REFERENCES tipo_proyecto(id) ON DELETE SET NULL,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Allocations Table
CREATE TABLE IF NOT EXISTS allocations (
    id SERIAL PRIMARY KEY,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    hours REAL NOT NULL DEFAULT 0,
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(colaborador_id, cliente_id, date)
);

-- 6. Users Table for Authentication
CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('administrador', 'visualizador')),
    name TEXT,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_allocations_week ON allocations(year, week_number);
CREATE INDEX IF NOT EXISTS idx_allocations_colaborador ON allocations(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_allocations_cliente ON allocations(cliente_id);
CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(id_area);
CREATE INDEX IF NOT EXISTS idx_clientes_proyecto ON clientes(id_proyecto);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes(id_tipo_proyecto);
CREATE INDEX IF NOT EXISTS idx_clientes_area ON clientes(id_area);
CREATE INDEX IF NOT EXISTS idx_usuarios_area ON usuarios(id_area);

-- Insert default admin user with bcrypt hashed password (admin123)
-- The password below is bcrypt hash of 'admin123' with cost factor 12
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO usuarios (username, password, role, name)
VALUES ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G5e1Q3x0jY1W6i', 'administrador', 'Administrador')
ON CONFLICT (username) DO NOTHING;
`;

async function initializeDatabase() {
    try {
        await pool.query(schema);
        console.log('PostgreSQL database schema initialized successfully');
    } catch (err) {
        console.error('Error initializing PostgreSQL database schema:', err);
        throw err;
    }
}

// Initialize on module load
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected error on PostgreSQL client', err);
});

// Wrapper to make PostgreSQL work like SQLite callback style
const db = {
    // For SELECT queries returning multiple rows
    all: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const pgSql = convertPlaceholders(sql);
        pool.query(pgSql, params)
            .then(result => callback(null, result.rows))
            .catch(err => callback(err));
    },

    // For SELECT queries returning single row
    get: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        const pgSql = convertPlaceholders(sql);
        pool.query(pgSql, params)
            .then(result => callback(null, result.rows[0]))
            .catch(err => callback(err));
    },

    // For INSERT/UPDATE/DELETE
    run: (sql, params, callback) => {
        if (typeof params === 'function') {
            callback = params;
            params = [];
        }
        let pgSql = convertPlaceholders(sql);
        // Add RETURNING id for INSERT statements to get lastID
        if (pgSql.trim().toUpperCase().startsWith('INSERT') && !pgSql.toUpperCase().includes('RETURNING')) {
            pgSql += ' RETURNING id';
        }
        pool.query(pgSql, params)
            .then(result => {
                // Simulate SQLite's this context with lastID and changes
                const context = {
                    lastID: result.rows[0]?.id || null,
                    changes: result.rowCount
                };
                if (callback) callback.call(context, null);
            })
            .catch(err => {
                if (callback) callback(err);
            });
    },

    // For executing multiple statements
    exec: (sql, callback) => {
        pool.query(sql)
            .then(() => callback && callback(null))
            .catch(err => callback && callback(err));
    },

    // Initialize the database
    initialize: initializeDatabase,

    // Close pool (for graceful shutdown)
    close: () => {
        return pool.end();
    },

    // Get raw pool for advanced usage
    pool: pool
};

module.exports = db;
