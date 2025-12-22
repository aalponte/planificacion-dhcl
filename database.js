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
        db.run('CREATE INDEX IF NOT EXISTS idx_usuarios_area ON usuarios(id_area)', () => {});
    });

    // Add id_area column to clientes if not exists
    db.run('ALTER TABLE clientes ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to clientes');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_clientes_area ON clientes(id_area)', () => {});
    });

    // Add id_area column to allocations if not exists
    db.run('ALTER TABLE allocations ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to allocations');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_allocations_area ON allocations(id_area)', () => {});
    });

    // Add id_area column to colaboradores if not exists
    db.run('ALTER TABLE colaboradores ADD COLUMN id_area INTEGER REFERENCES areas(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added id_area to colaboradores');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_colaboradores_area ON colaboradores(id_area)', () => {});
    });

    // Add region_id column to areas if not exists
    db.run('ALTER TABLE areas ADD COLUMN region_id INTEGER REFERENCES regiones(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added region_id to areas');
        }
        // Create index after ensuring column exists
        db.run('CREATE INDEX IF NOT EXISTS idx_areas_region ON areas(region_id)', () => {});
    });

    // Add pais_id column to areas if not exists
    db.run('ALTER TABLE areas ADD COLUMN pais_id INTEGER REFERENCES paises(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added pais_id to areas');
        }
        // Create index after ensuring column exists
        db.run('CREATE INDEX IF NOT EXISTS idx_areas_pais ON areas(pais_id)', () => {});
    });

    // Add region_id column to clientes if not exists
    db.run('ALTER TABLE clientes ADD COLUMN region_id INTEGER REFERENCES regiones(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added region_id to clientes');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_clientes_region ON clientes(region_id)', () => {});
    });

    // Add pais_id column to clientes if not exists
    db.run('ALTER TABLE clientes ADD COLUMN pais_id INTEGER REFERENCES paises(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added pais_id to clientes');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_clientes_pais ON clientes(pais_id)', () => {});
    });

    // Add region_id column to allocations if not exists
    db.run('ALTER TABLE allocations ADD COLUMN region_id INTEGER REFERENCES regiones(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added region_id to allocations');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_allocations_region ON allocations(region_id)', () => {});
    });

    // Add pais_id column to allocations if not exists
    db.run('ALTER TABLE allocations ADD COLUMN pais_id INTEGER REFERENCES paises(id)', (err) => {
        if (err && !err.message.includes('duplicate column')) {
            // Column already exists, ignore
        } else if (!err) {
            console.log('Migration: Added pais_id to allocations');
        }
        db.run('CREATE INDEX IF NOT EXISTS idx_allocations_pais ON allocations(pais_id)', () => {});
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

        // Link Data Hub and Channel Lab areas to Global region/country
        db.get('SELECT id FROM regiones WHERE es_global = 1 LIMIT 1', (err, region) => {
            if (err || !region) return;
            db.get('SELECT id FROM paises WHERE es_global = 1 LIMIT 1', (err, pais) => {
                if (err || !pais) return;
                db.run(`UPDATE areas SET region_id = ?, pais_id = ? WHERE (name = 'Data Hub' OR name = 'Channel Lab') AND region_id IS NULL`,
                    [region.id, pais.id], function(err) {
                        if (!err && this.changes > 0) {
                            console.log(`Migration: Linked ${this.changes} areas to Global region/country`);
                        }
                    });

                // Update clientes with NULL region_id or pais_id to Global
                db.run('UPDATE clientes SET region_id = ? WHERE region_id IS NULL', [region.id], function(err) {
                    if (!err && this.changes > 0) {
                        console.log(`Migration: Updated ${this.changes} clientes with Global region`);
                    }
                });
                db.run('UPDATE clientes SET pais_id = ? WHERE pais_id IS NULL', [pais.id], function(err) {
                    if (!err && this.changes > 0) {
                        console.log(`Migration: Updated ${this.changes} clientes with Global pais`);
                    }
                });

                // Update allocations with NULL region_id or pais_id to Global
                db.run('UPDATE allocations SET region_id = ? WHERE region_id IS NULL', [region.id], function(err) {
                    if (!err && this.changes > 0) {
                        console.log(`Migration: Updated ${this.changes} allocations with Global region`);
                    }
                });
                db.run('UPDATE allocations SET pais_id = ? WHERE pais_id IS NULL', [pais.id], function(err) {
                    if (!err && this.changes > 0) {
                        console.log(`Migration: Updated ${this.changes} allocations with Global pais`);
                    }
                });
            });
        });
    }, 500);
}

// Export configured database
module.exports = db;
