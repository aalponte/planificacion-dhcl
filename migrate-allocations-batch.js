/**
 * Script para migrar allocations restantes en batches
 */

const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();

const NEON_URL = 'postgresql://neondb_owner:npg_vVXpb7TW3Qih@ep-morning-cloud-acp4rgbt-pooler.sa-east-1.aws.neon.tech/planificacion?sslmode=require';
const SQLITE_PATH = './database.sqlite';
const BATCH_SIZE = 100;

async function main() {
    console.log('=== MIGRACIÓN BATCH DE ALLOCATIONS ===\n');

    const pool = new Pool({
        connectionString: NEON_URL,
        ssl: { rejectUnauthorized: false }
    });

    const sqlite = new sqlite3.Database(SQLITE_PATH);
    const sqliteAll = (sql) => new Promise((resolve, reject) => {
        sqlite.all(sql, [], (err, rows) => err ? reject(err) : resolve(rows));
    });

    // Obtener IDs ya migrados
    const existing = await pool.query('SELECT id FROM allocations');
    const existingIds = new Set(existing.rows.map(r => r.id));
    console.log(`Allocations ya en Neon: ${existingIds.size}`);

    // Obtener todas las allocations de SQLite
    const allRows = await sqliteAll('SELECT * FROM allocations ORDER BY id');
    console.log(`Allocations en SQLite: ${allRows.length}`);

    // Filtrar las que faltan
    const toMigrate = allRows.filter(r => !existingIds.has(r.id));
    console.log(`Allocations por migrar: ${toMigrate.length}\n`);

    if (toMigrate.length === 0) {
        console.log('✓ Todas las allocations ya están migradas');
        await pool.end();
        sqlite.close();
        return;
    }

    // Migrar en batches
    let migrated = 0;
    const batches = Math.ceil(toMigrate.length / BATCH_SIZE);

    for (let i = 0; i < batches; i++) {
        const batch = toMigrate.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

        // Construir INSERT con múltiples VALUES
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const row of batch) {
            const params = [
                row.id,
                row.colaborador_id,
                row.cliente_id,
                row.date,
                row.hours,
                row.week_number,
                row.year,
                row.id_area,
                row.created_at,
                row.region_id,
                row.pais_id
            ];
            values.push(...params);
            placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        }

        const sql = `
            INSERT INTO allocations (id, colaborador_id, cliente_id, date, hours, week_number, year, id_area, created_at, region_id, pais_id)
            VALUES ${placeholders.join(', ')}
            ON CONFLICT (id) DO NOTHING
        `;

        try {
            await pool.query(sql, values);
            migrated += batch.length;
            process.stdout.write(`\r   Migrado: ${migrated}/${toMigrate.length} (${Math.round(migrated/toMigrate.length*100)}%)`);
        } catch (err) {
            console.log(`\n   Error en batch ${i + 1}: ${err.message}`);
        }
    }

    console.log('\n');

    // Actualizar secuencia
    await pool.query(`SELECT setval(pg_get_serial_sequence('allocations', 'id'), COALESCE((SELECT MAX(id) FROM allocations), 1))`);

    // Verificar
    const final = await pool.query('SELECT COUNT(*) as c FROM allocations');
    const range = await pool.query('SELECT MIN(date) as min_d, MAX(date) as max_d FROM allocations');

    console.log(`✓ Total allocations en Neon: ${final.rows[0].c}`);
    console.log(`✓ Rango: ${range.rows[0].min_d} a ${range.rows[0].max_d}`);

    await pool.end();
    sqlite.close();
}

main().catch(console.error);
