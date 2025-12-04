const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('./db'); // Use the abstraction layer (SQLite local, PostgreSQL production)

const app = express();
const PORT = process.env.PORT || 3000; // Use PORT from environment (Cloud Run sets this)

// Multer setup for CSV uploads
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Health check endpoint for Railway/Cloud Run
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// Authentication Endpoints
// ============================================

// Login endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    // First check if user exists
    db.get('SELECT id, username, password, role, name FROM usuarios WHERE username = ?',
        [username], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });
            if (user.password !== password) return res.status(401).json({ error: 'Contraseña incorrecta' });
            // Return user without password
            res.json({ success: true, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
        });
});

// ============================================
// Users CRUD Endpoints
// ============================================

// Get all users
app.get('/api/config/usuarios', (req, res) => {
    db.all('SELECT id, username, role, name, created_at FROM usuarios ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create user
app.post('/api/config/usuarios', (req, res) => {
    const { username, password, role, name } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Username, password and role are required' });
    }
    if (!['administrador', 'visualizador'].includes(role)) {
        return res.status(400).json({ error: 'Role must be administrador or visualizador' });
    }
    db.run('INSERT INTO usuarios (username, password, role, name) VALUES (?, ?, ?, ?)',
        [username, password, role, name || username], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, username, role, name: name || username });
        });
});

// Update user
app.put('/api/config/usuarios/:id', (req, res) => {
    const { id } = req.params;
    const { username, password, role, name } = req.body;
    if (!username || !role) {
        return res.status(400).json({ error: 'Username and role are required' });
    }

    let sql, params;
    if (password) {
        sql = 'UPDATE usuarios SET username = ?, password = ?, role = ?, name = ? WHERE id = ?';
        params = [username, password, role, name || username, id];
    } else {
        sql = 'UPDATE usuarios SET username = ?, role = ?, name = ? WHERE id = ?';
        params = [username, role, name || username, id];
    }

    db.run(sql, params, function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Delete user
app.delete('/api/config/usuarios/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM usuarios WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, changes: this.changes });
    });
});

// Bulk delete users
app.delete('/api/config/usuarios', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs array' });
    }
    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM usuarios WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Deleted ${ids.length} users` });
    });
});

// ============================================
// Configuration CRUD Endpoints
// ============================================

// COLABORADORES
app.get('/api/config/colaboradores', (req, res) => {
    db.all('SELECT * FROM colaboradores ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/config/colaboradores', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    db.run('INSERT INTO colaboradores (name) VALUES (?)', [name], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/colaboradores/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    db.run('UPDATE colaboradores SET name = ? WHERE id = ?', [name, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated successfully' });
    });
});

app.delete('/api/config/colaboradores/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM colaboradores WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.post('/api/config/colaboradores/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM colaboradores WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Deleted ${ids.length} records` });
    });
});

// PROYECTOS
app.get('/api/config/proyectos', (req, res) => {
    db.all('SELECT * FROM proyectos ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/config/proyectos', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    db.run('INSERT INTO proyectos (name) VALUES (?)', [name], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/proyectos/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    db.run('UPDATE proyectos SET name = ? WHERE id = ?', [name, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated successfully' });
    });
});

app.delete('/api/config/proyectos/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM proyectos WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.post('/api/config/proyectos/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM proyectos WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Deleted ${ids.length} records` });
    });
});

// TIPOS DE PROYECTO
app.get('/api/config/tipos', (req, res) => {
    db.all('SELECT * FROM tipo_proyecto ORDER BY name', (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/config/tipos', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    db.run('INSERT INTO tipo_proyecto (name) VALUES (?)', [name], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name });
    });
});

app.put('/api/config/tipos/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    db.run('UPDATE tipo_proyecto SET name = ? WHERE id = ?', [name, id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Updated successfully' });
    });
});

app.delete('/api/config/tipos/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM tipo_proyecto WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.post('/api/config/tipos/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM tipo_proyecto WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Deleted ${ids.length} records` });
    });
});

// CLIENTES (with FK references)
app.get('/api/config/clientes', (req, res) => {
    const sql = `
        SELECT 
            c.id,
            c.name,
            c.id_proyecto as proyecto_id,
            c.id_tipo_proyecto as tipo_id,
            p.name as proyecto_name,
            t.name as tipo_name
        FROM clientes c
        LEFT JOIN proyectos p ON c.id_proyecto = p.id
        LEFT JOIN tipo_proyecto t ON c.id_tipo_proyecto = t.id
        ORDER BY c.name
    `;
    db.all(sql, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/config/clientes', (req, res) => {
    const { name, id_proyecto, id_tipo_proyecto } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    db.run(
        'INSERT INTO clientes (name, id_proyecto, id_tipo_proyecto) VALUES (?, ?, ?)',
        [name, id_proyecto || null, id_tipo_proyecto || null],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, name, id_proyecto, id_tipo_proyecto });
        }
    );
});

app.put('/api/config/clientes/:id', (req, res) => {
    const { id } = req.params;
    const { name, id_proyecto, id_tipo_proyecto } = req.body;

    db.run(
        'UPDATE clientes SET name = ?, id_proyecto = ?, id_tipo_proyecto = ? WHERE id = ?',
        [name, id_proyecto || null, id_tipo_proyecto || null, id],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Updated successfully' });
        }
    );
});

app.delete('/api/config/clientes/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM clientes WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.post('/api/config/clientes/bulk-delete', (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'Invalid IDs array' });
    }

    const placeholders = ids.map(() => '?').join(',');
    db.run(`DELETE FROM clientes WHERE id IN (${placeholders})`, ids, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: `Deleted ${ids.length} records` });
    });
});

// ============================================
// CSV Import Endpoints
// ============================================

app.get('/api/init-data', (req, res) => {
    const data = {};
    db.serialize(() => {
        db.all("SELECT * FROM colaboradores ORDER BY name", (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            data.workers = rows;

            db.all("SELECT * FROM clientes ORDER BY name", (err, rows) => {
                if (err) return res.status(500).json({ error: err.message });
                data.projects = rows;
                res.json(data);
            });
        });
    });
});

// CSV Helper
function parseCSV(content) {
    const lines = content.trim().split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const obj = {};
        headers.forEach((header, index) => { obj[header] = values[index] || ''; });
        return obj;
    });
}

// CSV Import Endpoints
app.post('/api/config/colaboradores/import', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        const stmt = db.prepare('INSERT OR IGNORE INTO colaboradores (name) VALUES (?)');
        let count = 0;
        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('colab'));
            if (key && row[key] && row[key].trim()) { stmt.run(row[key].trim()); count++; }
        });
        stmt.finalize();
        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/proyectos/import', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        const stmt = db.prepare('INSERT OR IGNORE INTO proyectos (name) VALUES (?)');
        let count = 0;
        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('proy'));
            if (key && row[key] && row[key].trim()) { stmt.run(row[key].trim()); count++; }
        });
        stmt.finalize();
        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/config/tipos/import', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const content = fs.readFileSync(req.file.path, 'utf-8');
        const data = parseCSV(content);
        const stmt = db.prepare('INSERT OR IGNORE INTO tipo_proyecto (name) VALUES (?)');
        let count = 0;
        data.forEach(row => {
            const key = Object.keys(row).find(k => k.toLowerCase().includes('tipo'));
            if (key && row[key] && row[key].trim()) { stmt.run(row[key].trim()); count++; }
        });
        stmt.finalize();
        fs.unlinkSync(req.file.path);
        res.json({ message: `Importados ${count} registros` });
    } catch (error) {
        console.error('Error:', error);
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Allocations Endpoints (Planning Module)
// ============================================

// Get allocations for a specific week
app.get('/api/allocations', (req, res) => {
    const { year, week } = req.query;
    if (!year || !week) {
        return res.status(400).json({ error: 'Year and week are required' });
    }
    const sql = `
        SELECT 
            a.*,
            c.name as colaborador_name,
            cl.name as cliente_name,
            p.name as proyecto_name,
            t.name as tipo_name
        FROM allocations a
        JOIN colaboradores c ON a.colaborador_id = c.id
        JOIN clientes cl ON a.cliente_id = cl.id
        LEFT JOIN proyectos p ON cl.id_proyecto = p.id
        LEFT JOIN tipo_proyecto t ON cl.id_tipo_proyecto = t.id
        WHERE a.year = ? AND a.week_number = ?
        ORDER BY c.name, a.date
    `;
    db.all(sql, [year, week], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Get available weeks with data
app.get('/api/allocations/weeks', (req, res) => {
    const { year } = req.query;
    const sql = year
        ? 'SELECT DISTINCT year, week_number FROM allocations WHERE year = ? ORDER BY year DESC, week_number DESC'
        : 'SELECT DISTINCT year, week_number FROM allocations ORDER BY year DESC, week_number DESC';
    const params = year ? [year] : [];
    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create new allocation
app.post('/api/allocations', (req, res) => {
    const { colaborador_id, cliente_id, date, hours, week_number, year } = req.body;
    if (!colaborador_id || !cliente_id || !date || hours === undefined || !week_number || !year) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    db.run(
        `INSERT INTO allocations (colaborador_id, cliente_id, date, hours, week_number, year)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [colaborador_id, cliente_id, date, hours, week_number, year],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: 'Allocation created', id: this.lastID });
        }
    );
});

// Update allocation
app.put('/api/allocations/:id', (req, res) => {
    const { id } = req.params;
    const { colaborador_id, cliente_id, date, hours, week_number, year } = req.body;
    if (!colaborador_id || !cliente_id || !date || hours === undefined || !week_number || !year) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    db.run(
        `UPDATE allocations 
         SET colaborador_id = ?, cliente_id = ?, date = ?, hours = ?, week_number = ?, year = ?
         WHERE id = ?`,
        [colaborador_id, cliente_id, date, hours, week_number, year, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Allocation not found' });
            }
            res.json({ message: 'Allocation updated', id, changes: this.changes });
        }
    );
});


// Copy week allocations
app.post('/api/allocations/copy', (req, res) => {
    const { fromYear, fromWeek, toYear, toWeek } = req.body;

    console.log(`[Copy Week] Request: ${fromWeek}/${fromYear} -> ${toWeek}/${toYear}`);

    if (!fromYear || !fromWeek || !toYear || !toWeek) {
        return res.status(400).json({ error: 'Missing required fields: fromYear, fromWeek, toYear, toWeek' });
    }

    // Get all allocations from the source week
    const selectSql = `
        SELECT colaborador_id, cliente_id, date, hours
        FROM allocations
        WHERE year = ? AND week_number = ?
        ORDER BY date, colaborador_id
    `;

    db.all(selectSql, [fromYear, fromWeek], (err, sourceAllocations) => {
        if (err) {
            console.error('[Copy Week] Error fetching source:', err);
            return res.status(500).json({ error: err.message });
        }

        console.log(`[Copy Week] Found ${sourceAllocations.length} source allocations`);

        if (sourceAllocations.length === 0) {
            return res.status(404).json({ error: `No se encontraron asignaciones para la semana ${fromWeek}/${fromYear}` });
        }

        // Calculate the Monday of each week using ISO week calculation
        function getDateOfISOWeek(w, y) {
            const simple = new Date(y, 0, 1 + (w - 1) * 7);
            const dow = simple.getDay();
            const ISOweekStart = new Date(simple);
            if (dow <= 4) {
                ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
            } else {
                ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
            }
            return ISOweekStart;
        }

        const sourceMonday = getDateOfISOWeek(fromWeek, fromYear);
        const targetMonday = getDateOfISOWeek(toWeek, toYear);

        // Calculate the day difference between the two weeks
        const dayDifference = Math.round((targetMonday - sourceMonday) / (1000 * 60 * 60 * 24));

        console.log(`[Copy Week] Source Monday: ${sourceMonday.toISOString().split('T')[0]}`);
        console.log(`[Copy Week] Target Monday: ${targetMonday.toISOString().split('T')[0]}`);
        console.log(`[Copy Week] Day difference: ${dayDifference} days`);

        // Prepare insert statement
        const insertSql = `
            INSERT INTO allocations (colaborador_id, cliente_id, date, hours, week_number, year)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        const stmt = db.prepare(insertSql);
        let insertedCount = 0;
        let errors = [];

        // Copy each allocation by adding the day difference to its date
        sourceAllocations.forEach(alloc => {
            const sourceDate = new Date(alloc.date + 'T00:00:00'); // Ensure proper date parsing
            const targetDate = new Date(sourceDate);
            targetDate.setDate(sourceDate.getDate() + dayDifference);
            const dateStr = targetDate.toISOString().split('T')[0];

            console.log(`[Copy Week] Copying: ${alloc.date} -> ${dateStr} (${alloc.hours}h for colaborador ${alloc.colaborador_id}, cliente ${alloc.cliente_id})`);

            stmt.run(
                [alloc.colaborador_id, alloc.cliente_id, dateStr, alloc.hours, toWeek, toYear],
                function (err) {
                    if (err) {
                        console.error('[Copy Week] Insert error:', err.message);
                        errors.push(err.message);
                    } else {
                        insertedCount++;
                    }
                }
            );
        });

        stmt.finalize((err) => {
            if (err) {
                console.error('[Copy Week] Finalize error:', err);
                return res.status(500).json({ error: err.message });
            }

            console.log(`[Copy Week] Successfully inserted ${insertedCount} allocations`);

            if (errors.length > 0) {
                console.error('[Copy Week] Errors:', errors);
                return res.status(500).json({
                    error: 'Algunos registros no se pudieron copiar',
                    details: errors,
                    inserted: insertedCount
                });
            }

            res.json({
                message: `Copiadas ${insertedCount} asignaciones de semana ${fromWeek}/${fromYear} a semana ${toWeek}/${toYear}`,
                sourceCount: sourceAllocations.length,
                insertedCount: insertedCount
            });
        });
    });
});
// Delete allocation
app.delete('/api/allocations/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM allocations WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Allocation deleted', changes: this.changes });
    });
});

// Delete all allocations for a collaborator in a specific week
app.delete('/api/allocations/collaborator/:colaborador_id/week/:year/:week', (req, res) => {
    const { colaborador_id, year, week } = req.params;

    console.log(`[Delete Collaborator Planning] Deleting all allocations for colaborador ${colaborador_id} in week ${week}/${year}`);

    db.run(
        'DELETE FROM allocations WHERE colaborador_id = ? AND year = ? AND week_number = ?',
        [colaborador_id, year, week],
        function (err) {
            if (err) {
                console.error('[Delete Collaborator Planning] Error:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`[Delete Collaborator Planning] Deleted ${this.changes} allocations`);
            res.json({
                message: `Deleted ${this.changes} allocations for collaborator`,
                changes: this.changes
            });
        }
    );
});

// Delete all allocations for an entire week
app.delete('/api/allocations/week/:year/:week', (req, res) => {
    const { year, week } = req.params;

    console.log(`[Delete Week Planning] Deleting all allocations for week ${week}/${year}`);

    db.run(
        'DELETE FROM allocations WHERE year = ? AND week_number = ?',
        [year, week],
        function (err) {
            if (err) {
                console.error('[Delete Week Planning] Error:', err);
                return res.status(500).json({ error: err.message });
            }
            console.log(`[Delete Week Planning] Deleted ${this.changes} allocations`);
            res.json({
                message: `Deleted entire week planning (${this.changes} allocations)`,
                changes: this.changes
            });
        }
    );
});

// ============================================
// Dashboard Analytics Endpoint
// ============================================


app.get('/api/dashboard/analytics', async (req, res) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    try {
        const analytics = {
            kpis: {},
            projectTypeDistribution: [],
            collaboratorHours: []
        };

        // Helper function to promisify db.get
        const dbGet = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.get(sql, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        };

        // Helper function to promisify db.all
        const dbAll = (sql, params) => {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        // KPI 1: Total Hours
        const totalHoursResult = await dbGet(
            `SELECT SUM(hours) as totalHours FROM allocations WHERE date BETWEEN ? AND ?`,
            [startDate, endDate]
        );
        analytics.kpis.totalHours = totalHoursResult?.totalHours || 0;

        // KPI 2: Active Projects (all clients except tipo_proyecto = 'Otro')
        const activeProjectsResult = await dbGet(
            `SELECT COUNT(DISTINCT a.cliente_id) as activeProjects
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             INNER JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ? AND tp.name != 'Otro'`,
            [startDate, endDate]
        );

        analytics.kpis.activeProjects = activeProjectsResult?.activeProjects || 0;

        // KPI 3: Active Collaborators
        const activeCollabsResult = await dbGet(
            `SELECT COUNT(DISTINCT colaborador_id) as activeCollaborators
             FROM allocations WHERE date BETWEEN ? AND ?`,
            [startDate, endDate]
        );
        analytics.kpis.activeCollaborators = activeCollabsResult?.activeCollaborators || 0;

        // KPI 4: Average Allocation
        const avgAllocation = analytics.kpis.activeCollaborators > 0
            ? (analytics.kpis.totalHours / analytics.kpis.activeCollaborators).toFixed(1)
            : 0;
        analytics.kpis.averageAllocation = parseFloat(avgAllocation);

        // KPI 5: Collaborators on Vacation/Holiday
        const vacationResult = await dbGet(
            `SELECT COUNT(DISTINCT a.colaborador_id) as vacationCollaborators
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ? 
             AND (LOWER(c.name) LIKE '%vacacion%' OR LOWER(c.name) LIKE '%feriado%' OR LOWER(c.name) LIKE '%holiday%')`,
            [startDate, endDate]
        );
        analytics.kpis.vacationCollaborators = vacationResult?.vacationCollaborators || 0;

        // KPI 6: Collaborators in Training/Innovation (DEV/DCM)
        const trainingResult = await dbGet(
            `SELECT COUNT(DISTINCT a.colaborador_id) as trainingCollaborators
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ? 
             AND c.name IN ('DEV/DCM', 'DEV', 'DCM')`,
            [startDate, endDate]
        );
        analytics.kpis.trainingCollaborators = trainingResult?.trainingCollaborators || 0;

        // KPI 7: Training/Innovation Hours (DEV/DCM)
        const trainingHoursResult = await dbGet(
            `SELECT SUM(a.hours) as trainingHours
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             WHERE a.date BETWEEN ? AND ? 
             AND c.name IN ('DEV/DCM', 'DEV', 'DCM')`,
            [startDate, endDate]
        );
        analytics.kpis.trainingHours = trainingHoursResult?.trainingHours || 0;

        // Project Type Distribution
        const projectTypeRows = await dbAll(
            `SELECT tp.name as type, SUM(a.hours) as hours
             FROM allocations a
             INNER JOIN clientes c ON a.cliente_id = c.id
             INNER JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ?
             GROUP BY tp.id, tp.name
             ORDER BY hours DESC`,
            [startDate, endDate]
        );

        const totalHours = projectTypeRows.reduce((sum, row) => sum + row.hours, 0);
        analytics.projectTypeDistribution = projectTypeRows.map(row => ({
            type: row.type,
            hours: row.hours,
            percentage: totalHours > 0 ? ((row.hours / totalHours) * 100).toFixed(1) : 0
        }));

        // Collaborator Hours by Project
        const collaboratorRows = await dbAll(
            `SELECT 
                col.name as collaborator,
                c.name as client,
                tp.name as type,
                SUM(a.hours) as hours
             FROM allocations a
             INNER JOIN colaboradores col ON a.colaborador_id = col.id
             INNER JOIN clientes c ON a.cliente_id = c.id
             LEFT JOIN tipo_proyecto tp ON c.id_tipo_proyecto = tp.id
             WHERE a.date BETWEEN ? AND ?
             GROUP BY col.id, col.name, c.id, c.name, tp.name
             ORDER BY col.name, hours DESC`,
            [startDate, endDate]
        );

        // Group by collaborator
        const collaboratorMap = {};
        collaboratorRows.forEach(row => {
            if (!collaboratorMap[row.collaborator]) {
                collaboratorMap[row.collaborator] = {
                    collaborator: row.collaborator,
                    projects: []
                };
            }
            collaboratorMap[row.collaborator].projects.push({
                client: row.client,
                type: row.type,
                hours: row.hours
            });
        });

        analytics.collaboratorHours = Object.values(collaboratorMap);
        res.json(analytics);

    } catch (error) {
        console.error('[Analytics] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
