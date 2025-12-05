-- Database Schema for Resource Planning Application
-- LLYC Configuration Tables

-- ============================================
-- Configuration Tables
-- ============================================

-- 0. Areas (Business Units - Master)
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
