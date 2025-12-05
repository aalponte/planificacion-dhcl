#!/usr/bin/env node
/**
 * Migration Script: SQLite to PostgreSQL
 *
 * This script migrates all data from the local SQLite database to a PostgreSQL database.
 *
 * Usage:
 *   DATABASE_URL="postgresql://user:password@host:5432/dbname" node migrate-to-postgres.js
 *
 * Prerequisites:
 *   1. Create a Cloud SQL PostgreSQL instance in Google Cloud
 *   2. Create a database (e.g., 'planificacion')
 *   3. Get the connection string
 *   4. Run this script with the DATABASE_URL environment variable
 */

const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');

// Configuration
const SQLITE_PATH = path.join(__dirname, 'database.sqlite');

if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Usage: DATABASE_URL="postgresql://user:password@host:5432/dbname" node migrate-to-postgres.js');
    process.exit(1);
}

// Connect to both databases
const sqliteDb = new sqlite3.Database(SQLITE_PATH);
const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper to run SQLite query as Promise
function sqliteAll(sql) {
    return new Promise((resolve, reject) => {
        sqliteDb.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

// Helper to run PostgreSQL query
async function pgQuery(sql, params = []) {
    const client = await pgPool.connect();
    try {
        const result = await client.query(sql, params);
        return result;
    } finally {
        client.release();
    }
}

// Create PostgreSQL schema
async function createSchema() {
    console.log('Creating PostgreSQL schema...');

    const schema = `
        -- Drop existing tables in reverse order (to handle foreign keys)
        DROP TABLE IF EXISTS allocations CASCADE;
        DROP TABLE IF EXISTS clientes CASCADE;
        DROP TABLE IF EXISTS usuarios CASCADE;
        DROP TABLE IF EXISTS tipo_proyecto CASCADE;
        DROP TABLE IF EXISTS proyectos CASCADE;
        DROP TABLE IF EXISTS colaboradores CASCADE;
        DROP TABLE IF EXISTS areas CASCADE;

        -- 0. Areas
        CREATE TABLE areas (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 1. Colaboradores
        CREATE TABLE colaboradores (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 2. Proyectos
        CREATE TABLE proyectos (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 3. Tipo de Proyecto
        CREATE TABLE tipo_proyecto (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 4. Clientes
        CREATE TABLE clientes (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            id_proyecto INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
            id_tipo_proyecto INTEGER REFERENCES tipo_proyecto(id) ON DELETE SET NULL,
            id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- 5. Allocations
        CREATE TABLE allocations (
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

        -- 6. Usuarios
        CREATE TABLE usuarios (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('administrador', 'visualizador')),
            name TEXT,
            id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Indexes
        CREATE INDEX idx_allocations_week ON allocations(year, week_number);
        CREATE INDEX idx_allocations_colaborador ON allocations(colaborador_id);
        CREATE INDEX idx_allocations_cliente ON allocations(cliente_id);
        CREATE INDEX idx_allocations_area ON allocations(id_area);
        CREATE INDEX idx_clientes_proyecto ON clientes(id_proyecto);
        CREATE INDEX idx_clientes_tipo ON clientes(id_tipo_proyecto);
        CREATE INDEX idx_clientes_area ON clientes(id_area);
        CREATE INDEX idx_usuarios_area ON usuarios(id_area);
    `;

    await pgQuery(schema);
    console.log('Schema created successfully');
}

// Migrate a table
async function migrateTable(tableName, columns, hasIdArea = false) {
    console.log(`Migrating ${tableName}...`);

    try {
        const rows = await sqliteAll(`SELECT * FROM ${tableName}`);

        if (rows.length === 0) {
            console.log(`  No data in ${tableName}`);
            return 0;
        }

        let migrated = 0;
        for (const row of rows) {
            const values = columns.map(col => row[col]);
            const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

            try {
                await pgQuery(
                    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
                    values
                );
                migrated++;
            } catch (err) {
                console.error(`  Error inserting row in ${tableName}:`, err.message);
            }
        }

        // Reset sequence to max id
        const maxIdResult = await pgQuery(`SELECT COALESCE(MAX(id), 0) as max_id FROM ${tableName}`);
        const maxId = maxIdResult.rows[0].max_id;
        if (maxId > 0) {
            await pgQuery(`SELECT setval('${tableName}_id_seq', $1, true)`, [maxId]);
        }

        console.log(`  Migrated ${migrated}/${rows.length} rows`);
        return migrated;
    } catch (err) {
        console.error(`  Error migrating ${tableName}:`, err.message);
        return 0;
    }
}

// Main migration function
async function migrate() {
    console.log('='.repeat(50));
    console.log('Starting migration: SQLite -> PostgreSQL');
    console.log('='.repeat(50));
    console.log(`SQLite: ${SQLITE_PATH}`);
    console.log(`PostgreSQL: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);
    console.log('='.repeat(50));

    try {
        // Create schema
        await createSchema();

        // Migrate tables in order (respecting foreign keys)
        const stats = {};

        // 1. Areas (no dependencies)
        stats.areas = await migrateTable('areas', ['id', 'name', 'created_at']);

        // 2. Colaboradores (no dependencies)
        stats.colaboradores = await migrateTable('colaboradores', ['id', 'name', 'created_at']);

        // 3. Proyectos (no dependencies)
        stats.proyectos = await migrateTable('proyectos', ['id', 'name', 'created_at']);

        // 4. Tipo de Proyecto (no dependencies)
        stats.tipo_proyecto = await migrateTable('tipo_proyecto', ['id', 'name', 'created_at']);

        // 5. Clientes (depends on proyectos, tipo_proyecto, areas)
        stats.clientes = await migrateTable('clientes',
            ['id', 'name', 'id_proyecto', 'id_tipo_proyecto', 'id_area', 'created_at']);

        // 6. Usuarios (depends on areas)
        stats.usuarios = await migrateTable('usuarios',
            ['id', 'username', 'password', 'role', 'name', 'id_area', 'created_at']);

        // 7. Allocations (depends on colaboradores, clientes, areas)
        stats.allocations = await migrateTable('allocations',
            ['id', 'colaborador_id', 'cliente_id', 'date', 'hours', 'week_number', 'year', 'id_area', 'created_at']);

        // Summary
        console.log('='.repeat(50));
        console.log('Migration Summary:');
        console.log('='.repeat(50));
        Object.entries(stats).forEach(([table, count]) => {
            console.log(`  ${table}: ${count} rows`);
        });
        console.log('='.repeat(50));
        console.log('Migration completed successfully!');

    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    } finally {
        // Close connections
        sqliteDb.close();
        await pgPool.end();
    }
}

// Run migration
migrate();
