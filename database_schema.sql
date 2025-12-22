-- Database Schema for Resource Planning Application
-- LLYC Configuration Tables

-- ============================================
-- Configuration Tables
-- ============================================

-- 0. Regiones (Regions - Master)
CREATE TABLE IF NOT EXISTS regiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    es_global INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default global region
INSERT OR IGNORE INTO regiones (name, es_global) VALUES ('Global', 1);

-- 0b. Países (Countries)
CREATE TABLE IF NOT EXISTS paises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    region_id INTEGER REFERENCES regiones(id) ON DELETE CASCADE,
    es_global INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, region_id)
);

-- Insert default global country
INSERT OR IGNORE INTO paises (name, region_id, es_global)
SELECT 'Global', id, 1 FROM regiones WHERE es_global = 1;

-- 0c. Areas (Business Units - Master)
-- Note: region_id and pais_id columns are added via migrations for existing DBs
CREATE TABLE IF NOT EXISTS areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default areas
INSERT OR IGNORE INTO areas (name) VALUES ('Data Hub');
INSERT OR IGNORE INTO areas (name) VALUES ('Channel Lab');

-- 1. Colaboradores (Workers)
CREATE TABLE IF NOT EXISTS colaboradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Proyectos (Project Categories - Master)
CREATE TABLE IF NOT EXISTS proyectos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tipo de Proyecto (Project Types - Master)
CREATE TABLE IF NOT EXISTS tipo_proyecto (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Clientes (Clients with FK references)
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    id_proyecto INTEGER,
    id_tipo_proyecto INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_proyecto) REFERENCES proyectos(id) ON DELETE SET NULL,
    FOREIGN KEY (id_tipo_proyecto) REFERENCES tipo_proyecto(id) ON DELETE SET NULL
);

-- ============================================
-- Allocations Table
-- ============================================

CREATE TABLE IF NOT EXISTS allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    colaborador_id INTEGER NOT NULL,
    cliente_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    hours REAL NOT NULL DEFAULT 0,
    week_number INTEGER NOT NULL,
    year INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
    UNIQUE(colaborador_id, cliente_id, date)
);

-- ============================================
-- Indexes for Performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_allocations_week 
    ON allocations(year, week_number);

CREATE INDEX IF NOT EXISTS idx_allocations_colaborador 
    ON allocations(colaborador_id);

CREATE INDEX IF NOT EXISTS idx_allocations_cliente 
    ON allocations(cliente_id);

CREATE INDEX IF NOT EXISTS idx_clientes_proyecto 
    ON clientes(id_proyecto);

CREATE INDEX IF NOT EXISTS idx_clientes_tipo 
    ON clientes(id_tipo_proyecto);

-- ============================================
-- Users Table for Authentication
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('administrador', 'visualizador')),
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password: hashed bcrypt - original was 'admin123')
-- The password below is bcrypt hash of 'admin123' with cost factor 12
-- IMPORTANT: Change this password immediately after first login!
INSERT OR IGNORE INTO usuarios (username, password, role, name)
VALUES ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.G5e1Q3x0jY1W6i', 'administrador', 'Administrador');

-- ============================================
-- Migration: Add id_area column to tables
-- ============================================

-- Add id_area to usuarios (nullable - no area means can access all areas)
-- Using pragma to check if column exists before adding
CREATE TABLE IF NOT EXISTS _migration_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Add id_area to clientes if not exists
-- SQLite doesn't support IF NOT EXISTS for ADD COLUMN, so we use a workaround
-- These will fail silently if columns already exist due to try/catch in the database initialization

-- NOTE: Index for area filtering are created in database.js runMigrations() after columns are added

-- ============================================
-- COR Integration Tables
-- ============================================

-- COR API Configuration
CREATE TABLE IF NOT EXISTS config_cor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT,
    client_secret TEXT,
    ultima_sincronizacion DATETIME,
    intervalo_sync_horas INTEGER DEFAULT 24,
    sync_automatica INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default config row
INSERT OR IGNORE INTO config_cor (id) VALUES (1);

-- COR Project Mapping
CREATE TABLE IF NOT EXISTS mapeo_proyectos_cor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cor_project_id INTEGER,
    cor_project_name TEXT,
    cor_client_name TEXT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    vinculacion_auto INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- COR User Mapping
CREATE TABLE IF NOT EXISTS mapeo_usuarios_cor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cor_user_id INTEGER,
    cor_user_name TEXT,
    cor_user_email TEXT,
    colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
    vinculacion_auto INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- COR Real Hours (imported from COR)
CREATE TABLE IF NOT EXISTS horas_reales_cor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cor_counter_id INTEGER UNIQUE,
    cor_project_id INTEGER,
    cor_user_id INTEGER,
    colaborador_id INTEGER REFERENCES colaboradores(id),
    cliente_id INTEGER REFERENCES clientes(id),
    fecha DATE NOT NULL,
    horas REAL NOT NULL,
    week_number INTEGER,
    year INTEGER,
    status TEXT,
    descripcion TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for COR tables
CREATE INDEX IF NOT EXISTS idx_horas_reales_fecha ON horas_reales_cor(fecha);
CREATE INDEX IF NOT EXISTS idx_horas_reales_week ON horas_reales_cor(year, week_number);
CREATE INDEX IF NOT EXISTS idx_horas_reales_colaborador ON horas_reales_cor(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_horas_reales_cliente ON horas_reales_cor(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_proyectos_cliente ON mapeo_proyectos_cor(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_usuarios_colaborador ON mapeo_usuarios_cor(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_paises_region ON paises(region_id);
-- NOTE: idx_areas_region and idx_areas_pais are created in database.js runMigrations()
-- after the columns are added to existing tables
