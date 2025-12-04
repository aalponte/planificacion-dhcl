/**
 * Database abstraction layer
 * Uses PostgreSQL in production (DATABASE_URL set)
 * Uses SQLite in development (local)
 */

let db;

if (process.env.DATABASE_URL) {
    // Production: Use PostgreSQL
    console.log('[DB] Using PostgreSQL (production mode)');
    db = require('./database-pg');
    db.initialize();
} else {
    // Development: Use SQLite
    console.log('[DB] Using SQLite (development mode)');
    db = require('./database');
}

module.exports = db;
