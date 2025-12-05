const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.sqlite');
const schemaPath = path.join(__dirname, 'database_schema.sql');

// Create/Open database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    const schema = fs.readFileSync(schemaPath, 'utf8');

    db.exec(schema, (err) => {
        if (err) {
            console.error('Error initializing database schema:', err);
        } else {
            console.log('Database schema initialized successfully');
            // Run migrations for id_area columns
            runMigrations();
        }
    });
}

function runMigrations() {
    // Add id_area column to usuarios if not exists
    db.run('ALTER TABLE usuarios ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to usuarios');
        }
        // Create index after column exists
        db.run('CREATE INDEX IF NOT EXISTS idx_usuarios_area ON usuarios(id_area)', () => {});
    });

    // Add id_area column to clientes if not exists
    db.run('ALTER TABLE clientes ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to clientes');
        }
        // Create index after column exists
        db.run('CREATE INDEX IF NOT EXISTS idx_clientes_area ON clientes(id_area)', () => {});
    });

    // Add id_area column to allocations if not exists
    db.run('ALTER TABLE allocations ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to allocations');
        }
        // Create index after column exists
        db.run('CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(id_area)', () => {});
    });

    // Update existing clientes records with default area (lowest ID) if id_area is NULL
    setTimeout(() => {
        db.get('SELECT id FROM areas ORDER BY id ASC LIMIT 1', (err, area) => {
            if (err || !area) {
                console.log('Migration: No areas found, skipping default area assignment');
                return;
            }
            const defaultAreaId = area.id;

            // Update clientes with NULL id_area
            db.run('UPDATE clientes SET id_area = ? WHERE id_area IS NULL', [defaultAreaId], function(err) {
                if (err) {
                    console.error('Migration: Error updating clientes with default area:', err);
                } else if (this.changes > 0) {
                    console.log(`Migration: Updated ${this.changes} clientes with default area (id=${defaultAreaId})`);
                }
            });

            // Update allocations with NULL id_area
            db.run('UPDATE allocations SET id_area = ? WHERE id_area IS NULL', [defaultAreaId], function(err) {
                if (err) {
                    console.error('Migration: Error updating allocations with default area:', err);
                } else if (this.changes > 0) {
                    console.log(`Migration: Updated ${this.changes} allocations with default area (id=${defaultAreaId})`);
                }
            });
        });
    }, 500); // Wait 500ms to ensure columns are created first
}

// Export configured database
module.exports = db;
