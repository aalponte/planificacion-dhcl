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

// Schema for PostgreSQL - Complete with regions, countries, areas and COR integration
const schema = `
-- ============================================
-- Database Schema for Resource Planning Application
-- LLYC Configuration Tables (PostgreSQL version)
-- ============================================

-- 0a. Regiones (Regions - Master)
CREATE TABLE IF NOT EXISTS regiones (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    es_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default regions
INSERT INTO regiones (name, es_global) VALUES ('Global', TRUE) ON CONFLICT (name) DO NOTHING;
INSERT INTO regiones (name, es_global) VALUES ('Europa', FALSE) ON CONFLICT (name) DO NOTHING;
INSERT INTO regiones (name, es_global) VALUES ('Latinoamérica Norte', FALSE) ON CONFLICT (name) DO NOTHING;
INSERT INTO regiones (name, es_global) VALUES ('Latinoamérica Sur', FALSE) ON CONFLICT (name) DO NOTHING;
INSERT INTO regiones (name, es_global) VALUES ('USA', FALSE) ON CONFLICT (name) DO NOTHING;

-- 0b. Países (Countries - linked to Region)
CREATE TABLE IF NOT EXISTS paises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    region_id INTEGER REFERENCES regiones(id) ON DELETE CASCADE,
    es_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, region_id)
);

-- Insert default global country
INSERT INTO paises (name, region_id, es_global)
SELECT 'Global', id, TRUE FROM regiones WHERE name = 'Global'
ON CONFLICT (name, region_id) DO NOTHING;

-- 0c. Areas (Business Units - linked to Region and Country)
CREATE TABLE IF NOT EXISTS areas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    region_id INTEGER REFERENCES regiones(id) ON DELETE SET NULL,
    pais_id INTEGER REFERENCES paises(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, region_id, pais_id)
);

-- 1. Colaboradores (Workers)
CREATE TABLE IF NOT EXISTS colaboradores (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
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
-- COR Integration Tables
-- ============================================

-- 7. COR API Configuration
CREATE TABLE IF NOT EXISTS config_cor (
    id SERIAL PRIMARY KEY,
    api_key TEXT,
    client_secret TEXT,
    ultima_sincronizacion TIMESTAMP,
    intervalo_sync_horas INTEGER DEFAULT 24,
    sync_automatica BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config row
INSERT INTO config_cor (id) VALUES (1) ON CONFLICT DO NOTHING;

-- 8. COR Project Mapping (COR Project ↔ PlanificacionDH Client)
CREATE TABLE IF NOT EXISTS mapeo_proyectos_cor (
    id SERIAL PRIMARY KEY,
    cor_project_id INTEGER NOT NULL,
    cor_project_name TEXT,
    cor_client_id INTEGER,
    cor_client_name TEXT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    vinculacion_automatica BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cor_project_id)
);

-- 9. COR User Mapping (COR User ↔ PlanificacionDH Collaborator)
CREATE TABLE IF NOT EXISTS mapeo_usuarios_cor (
    id SERIAL PRIMARY KEY,
    cor_user_id INTEGER NOT NULL,
    cor_user_name TEXT,
    cor_user_email TEXT,
    colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
    vinculacion_automatica BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cor_user_id)
);

-- 10. COR Real Hours (imported from COR)
CREATE TABLE IF NOT EXISTS horas_reales_cor (
    id SERIAL PRIMARY KEY,
    cor_counter_id INTEGER UNIQUE,
    cor_project_id INTEGER,
    cor_project_name TEXT,
    cor_task_id INTEGER,
    cor_task_name TEXT,
    cor_user_id INTEGER,
    cor_user_name TEXT,
    colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    horas REAL NOT NULL,
    week_number INTEGER,
    year INTEGER,
    status TEXT,
    sincronizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- Indexes for Performance (core indexes only)
-- ============================================
CREATE INDEX IF NOT EXISTS idx_allocations_week ON allocations(year, week_number);
CREATE INDEX IF NOT EXISTS idx_allocations_colaborador ON allocations(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_allocations_cliente ON allocations(cliente_id);
CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(id_area);
CREATE INDEX IF NOT EXISTS idx_clientes_proyecto ON clientes(id_proyecto);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo ON clientes(id_tipo_proyecto);
CREATE INDEX IF NOT EXISTS idx_clientes_area ON clientes(id_area);
CREATE INDEX IF NOT EXISTS idx_usuarios_area ON usuarios(id_area);
-- Note: idx_colaboradores_area is created in runMigrations after ensuring column exists

-- Indexes for COR tables
CREATE INDEX IF NOT EXISTS idx_horas_reales_fecha ON horas_reales_cor(fecha);
CREATE INDEX IF NOT EXISTS idx_horas_reales_week ON horas_reales_cor(year, week_number);
CREATE INDEX IF NOT EXISTS idx_horas_reales_colaborador ON horas_reales_cor(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_horas_reales_cliente ON horas_reales_cor(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_proyectos_cliente ON mapeo_proyectos_cor(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_usuarios_colaborador ON mapeo_usuarios_cor(colaborador_id);

-- Indexes for regions and countries
CREATE INDEX IF NOT EXISTS idx_paises_region ON paises(region_id);
-- Note: idx_areas_region and idx_areas_pais are created in runMigrations after ensuring columns exist

-- Insert default admin user with bcrypt hashed password (admin123)
-- The password below is bcrypt hash of 'admin123' with cost factor 12
-- IMPORTANT: Change this password immediately after first login!
INSERT INTO usuarios (username, password, role, name)
VALUES ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G5e1Q3x0jY1W6i', 'administrador', 'Administrador')
ON CONFLICT (username) DO NOTHING;
`;

async function initializeDatabase() {
    try {
        // First run schema (CREATE TABLE IF NOT EXISTS won't modify existing tables,
        // but will create missing ones and set up indexes)
        await pool.query(schema);
        console.log('PostgreSQL database schema initialized successfully');

        // Then run migrations to add any missing columns to existing tables
        await runMigrations();
    } catch (err) {
        console.error('Error initializing PostgreSQL database schema:', err);
        throw err;
    }
}

// Run migrations for existing databases
async function runMigrations() {
    try {
        // Migration 1: Add id_area column to colaboradores if not exists
        const checkColabArea = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'colaboradores' AND column_name = 'id_area'
        `);

        if (checkColabArea.rows.length === 0) {
            await pool.query(`
                ALTER TABLE colaboradores
                ADD COLUMN id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL
            `);
            console.log('Migration: Added id_area column to colaboradores');

            await pool.query(`
                CREATE INDEX IF NOT EXISTS idx_colaboradores_area ON colaboradores(id_area)
            `);
            console.log('Migration: Created index idx_colaboradores_area');
        }

        // Migration 2: Add region_id column to areas if not exists
        const checkAreaRegion = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'areas' AND column_name = 'region_id'
        `);

        if (checkAreaRegion.rows.length === 0) {
            await pool.query(`
                ALTER TABLE areas
                ADD COLUMN region_id INTEGER REFERENCES regiones(id) ON DELETE SET NULL
            `);
            console.log('Migration: Added region_id column to areas');
        }

        // Create index for region_id on areas (always try, IF NOT EXISTS handles duplicates)
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_areas_region ON areas(region_id)`);

        // Migration 3: Add pais_id column to areas if not exists
        const checkAreaPais = await pool.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'areas' AND column_name = 'pais_id'
        `);

        if (checkAreaPais.rows.length === 0) {
            await pool.query(`
                ALTER TABLE areas
                ADD COLUMN pais_id INTEGER REFERENCES paises(id) ON DELETE SET NULL
            `);
            console.log('Migration: Added pais_id column to areas');
        }

        // Create index for pais_id on areas (always try, IF NOT EXISTS handles duplicates)
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_areas_pais ON areas(pais_id)`);

        // Migration 4: Link existing Data Hub and Channel Lab to Global region/country
        const globalRegion = await pool.query(`SELECT id FROM regiones WHERE es_global = TRUE LIMIT 1`);
        const globalPais = await pool.query(`SELECT id FROM paises WHERE es_global = TRUE LIMIT 1`);

        if (globalRegion.rows.length > 0 && globalPais.rows.length > 0) {
            const regionId = globalRegion.rows[0].id;
            const paisId = globalPais.rows[0].id;

            await pool.query(`
                UPDATE areas
                SET region_id = $1, pais_id = $2
                WHERE (name = 'Data Hub' OR name = 'Channel Lab')
                AND region_id IS NULL
            `, [regionId, paisId]);
            console.log('Migration: Linked existing areas to Global region/country');
        }

    } catch (err) {
        console.error('Error running migrations:', err);
        // Don't throw - migrations are optional improvements
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
