/**
 * Script para importar backup de Render PostgreSQL a SQLite
 * Backup: 2026-01-04T02_26Z (3 de enero 2026)
 */

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const BACKUP_DIR = '/mnt/c/Users/aalponte/Downloads/2026-01-04T02_26Z.dir/2026-01-04T02_26Z/planificacion';
const DB_PATH = './database.sqlite';
const BACKUP_DB_PATH = './database.sqlite.backup-before-import';

// Mapeo de archivos .dat a tablas (basado en análisis del backup)
const FILE_TABLE_MAP = {
    '3579.dat': { table: 'regiones', columns: ['id', 'name', 'es_global', 'created_at'] },
    '3581.dat': { table: 'paises', columns: ['id', 'name', 'region_id', 'es_global', 'created_at'] },
    '3565.dat': { table: 'areas', columns: ['id', 'name', 'created_at', 'region_id', 'pais_id'] },
    '3567.dat': { table: 'colaboradores', columns: ['id', 'name', 'created_at', 'id_area'] },
    '3569.dat': { table: 'proyectos', columns: ['id', 'name', 'created_at'] },
    '3571.dat': { table: 'tipo_proyecto', columns: ['id', 'name', 'created_at'] },
    '3573.dat': { table: 'clientes', columns: ['id', 'name', 'id_proyecto', 'id_tipo_proyecto', 'id_area', 'created_at', 'region_id', 'pais_id'] },
    '3575.dat': { table: 'allocations', columns: ['id', 'colaborador_id', 'cliente_id', 'date', 'hours', 'week_number', 'year', 'id_area', 'created_at', 'region_id', 'pais_id'] },
    '3577.dat': { table: 'usuarios', columns: ['id', 'username', 'password', 'role', 'name', 'id_area', 'created_at'] },
    '3583.dat': { table: 'config_cor', columns: ['id', 'api_key', 'client_secret', 'ultima_sincronizacion', 'intervalo_sync_horas', 'sync_automatica', 'created_at', 'updated_at'] },
};

// Parsear archivo .dat de PostgreSQL (formato COPY)
function parseDatFile(filePath, columns) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const rows = [];

    for (const line of lines) {
        // Ignorar líneas vacías y el terminador \.
        if (!line.trim() || line.trim() === '\\.' || line.startsWith('--')) {
            continue;
        }

        // Los campos están separados por tabs
        const values = line.split('\t').map(val => {
            // \N significa NULL en PostgreSQL
            if (val === '\\N') return null;
            // Convertir booleanos PostgreSQL
            if (val === 't') return 1;
            if (val === 'f') return 0;
            return val;
        });

        if (values.length >= columns.length - 2) { // Permitir algunas columnas faltantes
            rows.push(values);
        }
    }

    return rows;
}

async function main() {
    console.log('=== IMPORTACIÓN DE BACKUP RENDER A SQLite ===\n');

    // 1. Hacer backup del SQLite actual
    if (fs.existsSync(DB_PATH)) {
        console.log(`1. Creando backup de la BD actual...`);
        fs.copyFileSync(DB_PATH, BACKUP_DB_PATH);
        console.log(`   Backup guardado en: ${BACKUP_DB_PATH}\n`);
    }

    // 2. Conectar a SQLite
    const db = new sqlite3.Database(DB_PATH);

    const runQuery = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    };

    const getQuery = (sql, params = []) => {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    };

    try {
        // 3. Deshabilitar foreign keys temporalmente
        await runQuery('PRAGMA foreign_keys = OFF');

        // 4. Importar cada tabla en orden (respetando dependencias)
        const importOrder = [
            '3579.dat', // regiones
            '3581.dat', // paises
            '3565.dat', // areas
            '3569.dat', // proyectos
            '3571.dat', // tipo_proyecto
            '3567.dat', // colaboradores
            '3573.dat', // clientes
            '3577.dat', // usuarios
            '3575.dat', // allocations
            '3583.dat', // config_cor
        ];

        console.log('2. Importando tablas...\n');

        for (const filename of importOrder) {
            const config = FILE_TABLE_MAP[filename];
            if (!config) continue;

            const filePath = path.join(BACKUP_DIR, filename);
            if (!fs.existsSync(filePath)) {
                console.log(`   ⚠ ${filename} no existe, saltando...`);
                continue;
            }

            const rows = parseDatFile(filePath, config.columns);

            if (rows.length === 0) {
                console.log(`   ○ ${config.table}: 0 registros (vacío)`);
                continue;
            }

            // Limpiar tabla existente
            await runQuery(`DELETE FROM ${config.table}`);

            // Insertar registros
            let inserted = 0;
            for (const row of rows) {
                try {
                    // Construir INSERT dinámico basado en columnas disponibles
                    const numCols = Math.min(row.length, config.columns.length);
                    const cols = config.columns.slice(0, numCols);
                    const placeholders = cols.map(() => '?').join(', ');
                    const values = row.slice(0, numCols);

                    const sql = `INSERT OR REPLACE INTO ${config.table} (${cols.join(', ')}) VALUES (${placeholders})`;
                    await runQuery(sql, values);
                    inserted++;
                } catch (err) {
                    // Si falla, intentar con menos columnas
                    if (err.message.includes('has no column')) {
                        // Intentar sin las columnas extras (region_id, pais_id, etc)
                        const basicCols = config.columns.slice(0, Math.min(row.length, 5));
                        const basicPlaceholders = basicCols.map(() => '?').join(', ');
                        const basicValues = row.slice(0, basicCols.length);

                        try {
                            const sql = `INSERT OR REPLACE INTO ${config.table} (${basicCols.join(', ')}) VALUES (${basicPlaceholders})`;
                            await runQuery(sql, basicValues);
                            inserted++;
                        } catch (err2) {
                            console.log(`   ✗ Error insertando en ${config.table}:`, err2.message);
                        }
                    } else {
                        console.log(`   ✗ Error en ${config.table}:`, err.message);
                    }
                }
            }

            console.log(`   ✓ ${config.table}: ${inserted} registros importados`);
        }

        // 5. Resetear secuencias de autoincrement
        console.log('\n3. Actualizando secuencias...');
        for (const filename of importOrder) {
            const config = FILE_TABLE_MAP[filename];
            if (!config) continue;

            const maxId = await getQuery(`SELECT MAX(id) as max_id FROM ${config.table}`);
            if (maxId && maxId.max_id) {
                await runQuery(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`, [maxId.max_id, config.table]);
            }
        }
        console.log('   ✓ Secuencias actualizadas');

        // 6. Rehabilitar foreign keys
        await runQuery('PRAGMA foreign_keys = ON');

        // 7. Verificar integridad
        console.log('\n4. Verificando importación...\n');
        const tables = ['regiones', 'paises', 'areas', 'colaboradores', 'clientes', 'proyectos', 'tipo_proyecto', 'allocations', 'usuarios'];

        for (const table of tables) {
            const count = await getQuery(`SELECT COUNT(*) as count FROM ${table}`);
            console.log(`   ${table}: ${count.count} registros`);
        }

        // Verificar rango de fechas de allocations
        const dateRange = await getQuery(`SELECT MIN(date) as min_date, MAX(date) as max_date FROM allocations`);
        if (dateRange) {
            console.log(`\n   Allocations: ${dateRange.min_date} a ${dateRange.max_date}`);
        }

        console.log('\n=== IMPORTACIÓN COMPLETADA ===');
        console.log(`\nBackup anterior guardado en: ${BACKUP_DB_PATH}`);

    } catch (err) {
        console.error('\n✗ ERROR:', err.message);
        process.exit(1);
    } finally {
        db.close();
    }
}

main();
