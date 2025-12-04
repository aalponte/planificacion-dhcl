-- Database Schema for Resource Planning Application
-- LLYC Configuration Tables

-- ============================================
-- Configuration Tables
-- ============================================

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

-- Insert default admin user (password: admin123)
INSERT OR IGNORE INTO usuarios (username, password, role, name) 
VALUES ('admin', 'admin123', 'administrador', 'Administrador');
