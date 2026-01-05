/**
 * Script para migrar SQLite local a Neon PostgreSQL
 */

const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

// Configuración
const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_vVXpb7TW3Qih@ep-morning-cloud-acp4rgbt-pooler.sa-east-1.aws.neon.tech/planificacion?sslmode=require';
const SQLITE_PATH = './database.sqlite';

// Esquema PostgreSQL
const SCHEMA_SQL = `
-- Limpiar tablas existentes (en orden de dependencias)
DROP TABLE IF EXISTS horas_reales_cor CASCADE;
DROP TABLE IF EXISTS mapeo_usuarios_cor CASCADE;
DROP TABLE IF EXISTS mapeo_proyectos_cor CASCADE;
DROP TABLE IF EXISTS config_cor CASCADE;
DROP TABLE IF EXISTS allocations CASCADE;
DROP TABLE IF EXISTS clientes CASCADE;
DROP TABLE IF EXISTS colaboradores CASCADE;
DROP TABLE IF EXISTS tipo_proyecto CASCADE;
DROP TABLE IF EXISTS proyectos CASCADE;
DROP TABLE IF EXISTS areas CASCADE;
DROP TABLE IF EXISTS paises CASCADE;
DROP TABLE IF EXISTS regiones CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;
DROP TABLE IF EXISTS _migration_log CASCADE;

-- Regiones
CREATE TABLE regiones (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    es_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Paises
CREATE TABLE paises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    region_id INTEGER REFERENCES regiones(id) ON DELETE CASCADE,
    es_global BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, region_id)
);

-- Areas
CREATE TABLE areas (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    region_id INTEGER REFERENCES regiones(id) ON DELETE SET NULL,
    pais_id INTEGER REFERENCES paises(id) ON DELETE SET NULL
);

-- Proyectos
CREATE TABLE proyectos (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tipo Proyecto
CREATE TABLE tipo_proyecto (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Colaboradores
CREATE TABLE colaboradores (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL
);

-- Clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    id_proyecto INTEGER REFERENCES proyectos(id) ON DELETE SET NULL,
    id_tipo_proyecto INTEGER REFERENCES tipo_proyecto(id) ON DELETE SET NULL,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    region_id INTEGER REFERENCES regiones(id) ON DELETE SET NULL,
    pais_id INTEGER REFERENCES paises(id) ON DELETE SET NULL
);

-- Usuarios
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('administrador', 'visualizador')),
    name TEXT,
    id_area INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Allocations
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
    region_id INTEGER REFERENCES regiones(id) ON DELETE SET NULL,
    pais_id INTEGER REFERENCES paises(id) ON DELETE SET NULL,
    UNIQUE(colaborador_id, cliente_id, date)
);

-- Config COR
CREATE TABLE config_cor (
    id SERIAL PRIMARY KEY,
    api_key TEXT,
    client_secret TEXT,
    ultima_sincronizacion TIMESTAMP,
    intervalo_sync_horas INTEGER DEFAULT 24,
    sync_automatica BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mapeo Proyectos COR
CREATE TABLE mapeo_proyectos_cor (
    id SERIAL PRIMARY KEY,
    cor_project_id INTEGER,
    cor_project_name TEXT,
    cor_client_name TEXT,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    vinculacion_auto BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mapeo Usuarios COR
CREATE TABLE mapeo_usuarios_cor (
    id SERIAL PRIMARY KEY,
    cor_user_id INTEGER,
    cor_user_name TEXT,
    cor_user_email TEXT,
    colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE SET NULL,
    vinculacion_auto BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Horas Reales COR
CREATE TABLE horas_reales_cor (
    id SERIAL PRIMARY KEY,
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX idx_allocations_week ON allocations(year, week_number);
CREATE INDEX idx_allocations_colaborador ON allocations(colaborador_id);
CREATE INDEX idx_allocations_cliente ON allocations(cliente_id);
CREATE INDEX idx_clientes_proyecto ON clientes(id_proyecto);
CREATE INDEX idx_clientes_tipo ON clientes(id_tipo_proyecto);
CREATE INDEX idx_horas_reales_fecha ON horas_reales_cor(fecha);
CREATE INDEX idx_horas_reales_week ON horas_reales_cor(year, week_number);
CREATE INDEX idx_paises_region ON paises(region_id);
CREATE INDEX idx_areas_region ON areas(region_id);
`;

async function main() {
    console.log('=== MIGRACIÓN SQLite → Neon PostgreSQL ===\n');

    // Conectar a Neon
    console.log('1. Conectando a Neon...');
    const pool = new Pool({
        connectionString: NEON_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await pool.query('SELECT 1');
        console.log('   ✓ Conexión exitosa a Neon\n');
    } catch (err) {
        console.error('   ✗ Error conectando a Neon:', err.message);
        process.exit(1);
    }

    // Conectar a SQLite
    console.log('2. Conectando a SQLite local...');
    const sqlite = new sqlite3.Database(SQLITE_PATH);
    const sqliteAll = (sql) => new Promise((resolve, reject) => {
        sqlite.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows));
    });
    console.log('   ✓ SQLite conectado\n');

    // Crear esquema en Neon
    console.log('3. Creando esquema en Neon...');
    try {
        await pool.query(SCHEMA_SQL);
        console.log('   ✓ Esquema creado\n');
    } catch (err) {
        console.error('   ✗ Error creando esquema:', err.message);
        process.exit(1);
    }

    // Migrar datos
    console.log('4. Migrando datos...\n');

    const tables = [
        {
            name: 'regiones',
            columns: ['id', 'name', 'es_global', 'created_at'],
            transform: (row) => [row.id, row.name, row.es_global === 1, row.created_at]
        },
        {
            name: 'paises',
            columns: ['id', 'name', 'region_id', 'es_global', 'created_at'],
            transform: (row) => [row.id, row.name, row.region_id, row.es_global === 1, row.created_at]
        },
        {
            name: 'areas',
            columns: ['id', 'name', 'created_at', 'region_id', 'pais_id'],
            transform: (row) => [row.id, row.name, row.created_at, row.region_id, row.pais_id]
        },
        {
            name: 'proyectos',
            columns: ['id', 'name', 'created_at'],
            transform: (row) => [row.id, row.name, row.created_at]
        },
        {
            name: 'tipo_proyecto',
            columns: ['id', 'name', 'created_at'],
            transform: (row) => [row.id, row.name, row.created_at]
        },
        {
            name: 'colaboradores',
            columns: ['id', 'name', 'created_at', 'id_area'],
            transform: (row) => [row.id, row.name, row.created_at, row.id_area]
        },
        {
            name: 'clientes',
            columns: ['id', 'name', 'id_proyecto', 'id_tipo_proyecto', 'id_area', 'created_at', 'region_id', 'pais_id'],
            transform: (row) => [row.id, row.name, row.id_proyecto, row.id_tipo_proyecto, row.id_area, row.created_at, row.region_id, row.pais_id]
        },
        {
            name: 'usuarios',
            columns: ['id', 'username', 'password', 'role', 'name', 'id_area', 'created_at'],
            transform: (row) => [row.id, row.username, row.password, row.role, row.name, row.id_area, row.created_at]
        },
        {
            name: 'allocations',
            columns: ['id', 'colaborador_id', 'cliente_id', 'date', 'hours', 'week_number', 'year', 'id_area', 'created_at', 'region_id', 'pais_id'],
            transform: (row) => [row.id, row.colaborador_id, row.cliente_id, row.date, row.hours, row.week_number, row.year, row.id_area, row.created_at, row.region_id, row.pais_id]
        },
        {
            name: 'config_cor',
            columns: ['id', 'api_key', 'client_secret', 'ultima_sincronizacion', 'intervalo_sync_horas', 'sync_automatica', 'created_at', 'updated_at'],
            transform: (row) => [row.id, row.api_key, row.client_secret, row.ultima_sincronizacion, row.intervalo_sync_horas, row.sync_automatica === 1, row.created_at, row.updated_at]
        }
    ];

    for (const table of tables) {
        try {
            const rows = await sqliteAll(`SELECT * FROM ${table.name}`);

            if (rows.length === 0) {
                console.log(`   ○ ${table.name}: 0 registros`);
                continue;
            }

            // Insertar en batches
            let inserted = 0;
            for (const row of rows) {
                try {
                    const values = table.transform(row);
                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                    const sql = `INSERT INTO ${table.name} (${table.columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
                    await pool.query(sql, values);
                    inserted++;
                } catch (err) {
                    // Ignorar errores de datos faltantes
                    if (!err.message.includes('violates')) {
                        console.log(`     Error en ${table.name}:`, err.message);
                    }
                }
            }

            console.log(`   ✓ ${table.name}: ${inserted} registros`);

            // Actualizar secuencia
            await pool.query(`SELECT setval(pg_get_serial_sequence('${table.name}', 'id'), COALESCE((SELECT MAX(id) FROM ${table.name}), 1))`);

        } catch (err) {
            console.log(`   ✗ ${table.name}: ${err.message}`);
        }
    }

    // Verificar
    console.log('\n5. Verificando migración...\n');
    for (const table of tables) {
        const result = await pool.query(`SELECT COUNT(*) as count FROM ${table.name}`);
        console.log(`   ${table.name}: ${result.rows[0].count} registros`);
    }

    // Rango de allocations
    const range = await pool.query(`SELECT MIN(date) as min_d, MAX(date) as max_d FROM allocations`);
    console.log(`\n   Allocations: ${range.rows[0].min_d} a ${range.rows[0].max_d}`);

    console.log('\n=== MIGRACIÓN COMPLETADA ===\n');
    console.log('Connection String para .env:');
    console.log(`DATABASE_URL="${NEON_URL}"\n`);

    sqlite.close();
    await pool.end();
}

main().catch(console.error);
