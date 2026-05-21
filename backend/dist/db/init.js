"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initDb = initDb;
exports.isFirstRun = isFirstRun;
exports.createAdminUser = createAdminUser;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const logger_1 = require("../utils/logger");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createDatabase(dbPath) {
    // Try better-sqlite3 first (works on Vercel & most environments)
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
        const raw = new Database(dbPath);
        return {
            prepare(sql) {
                const stmt = raw.prepare(sql);
                return {
                    get(...params) { return stmt.get(...params); },
                    all(...params) { return stmt.all(...params); },
                    run(...params) { return stmt.run(...params); },
                };
            },
            exec(sql) { raw.exec(sql); },
            pragma(pragma) { raw.pragma(pragma); },
            transaction(fn) {
                return raw.transaction(fn);
            },
        };
    }
    catch (betterSqliteErr) {
        logger_1.logger.warn('better-sqlite3 unavailable, trying node:sqlite', { error: String(betterSqliteErr) });
        // Fallback to Node 24 built-in node:sqlite
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { DatabaseSync } = require('node:sqlite');
            const raw = new DatabaseSync(dbPath);
            return {
                prepare(sql) {
                    return {
                        get(...params) {
                            const stmt = raw.prepare(sql);
                            stmt.setReadBigInts(false);
                            const rows = stmt.all(...params);
                            return rows[0];
                        },
                        all(...params) {
                            const stmt = raw.prepare(sql);
                            stmt.setReadBigInts(false);
                            return stmt.all(...params);
                        },
                        run(...params) {
                            const stmt = raw.prepare(sql);
                            stmt.setReadBigInts(false);
                            const r = stmt.run(...params);
                            return { lastInsertRowid: r.lastInsertRowid, changes: r.changes };
                        },
                    };
                },
                exec(sql) { raw.exec(sql); },
                pragma(pragma) { raw.exec(`PRAGMA ${pragma}`); },
                transaction(fn) {
                    return (arg) => {
                        raw.exec('BEGIN');
                        try {
                            fn(arg);
                            raw.exec('COMMIT');
                        }
                        catch (e) {
                            raw.exec('ROLLBACK');
                            throw e;
                        }
                    };
                },
            };
        }
        catch (nodeSqliteErr) {
            logger_1.logger.warn('node:sqlite unavailable, using sql.js in-memory', { error: String(nodeSqliteErr) });
            // Final fallback: sql.js (pure JS, works everywhere including Vercel)
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const initSqlJs = require('sql.js');
            // sql.js is async — we return a sync-compatible wrapper using a pre-initialized DB
            // Store data in /tmp as binary file if possible
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let sqlDb;
            const initSync = () => {
                // This is called synchronously but sql.js init is async —
                // we must initialize it before use via initDb() which is async
                throw new Error('sql.js not yet initialized — call initDb() first');
            };
            // Attach a pending promise that initDb will await
            createDatabase.sqlJsPromise =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                initSqlJs().then((SQL) => {
                    let data = null;
                    try {
                        if (fs_1.default.existsSync(dbPath))
                            data = fs_1.default.readFileSync(dbPath);
                    }
                    catch (_) { /* ok */ }
                    sqlDb = data ? new SQL.Database(data) : new SQL.Database();
                    const save = () => {
                        try {
                            const buf = sqlDb.export();
                            fs_1.default.mkdirSync(path_1.default.dirname(dbPath), { recursive: true });
                            fs_1.default.writeFileSync(dbPath, Buffer.from(buf));
                        }
                        catch (_) { /* /tmp may fail on some serverless */ }
                    };
                    const compat = {
                        prepare(sql) {
                            return {
                                get(...params) {
                                    const stmt = sqlDb.prepare(sql);
                                    stmt.bind(params);
                                    const row = stmt.step() ? stmt.getAsObject() : undefined;
                                    stmt.free();
                                    return row;
                                },
                                all(...params) {
                                    const stmt = sqlDb.prepare(sql);
                                    stmt.bind(params);
                                    const rows = [];
                                    while (stmt.step())
                                        rows.push(stmt.getAsObject());
                                    stmt.free();
                                    return rows;
                                },
                                run(...params) {
                                    sqlDb.run(sql, params);
                                    save();
                                    return { lastInsertRowid: sqlDb.exec('SELECT last_insert_rowid()')[0]?.values[0][0] ?? 0, changes: 0 };
                                },
                            };
                        },
                        exec(sql) { sqlDb.run(sql); save(); },
                        pragma(_p) { },
                        transaction(fn) {
                            return (arg) => {
                                sqlDb.run('BEGIN');
                                try {
                                    fn(arg);
                                    sqlDb.run('COMMIT');
                                    save();
                                }
                                catch (e) {
                                    sqlDb.run('ROLLBACK');
                                    throw e;
                                }
                            };
                        },
                    };
                    return compat;
                });
            // Return a placeholder — initDb will replace db with the resolved value
            return {
                prepare: initSync,
                exec: () => { throw new Error('sql.js not ready'); },
                pragma: () => { },
                transaction: () => () => { throw new Error('sql.js not ready'); },
            };
        }
    }
}
let db;
function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initDb() first.');
    }
    return db;
}
async function initDb() {
    const dbPath = process.env.DB_PATH || './data/oee_platform.db';
    const dbDir = path_1.default.dirname(dbPath);
    if (!fs_1.default.existsSync(dbDir)) {
        fs_1.default.mkdirSync(dbDir, { recursive: true });
    }
    db = createDatabase(dbPath);
    // If sql.js was used (async fallback), wait for it to initialize
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sqlJsPromise = createDatabase.sqlJsPromise;
    if (sqlJsPromise) {
        db = await sqlJsPromise;
        delete createDatabase.sqlJsPromise;
    }
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // schema.sql lives in src/db/ — resolve from both src and dist locations
    let schemaPath = path_1.default.join(__dirname, 'schema.sql');
    if (!fs_1.default.existsSync(schemaPath)) {
        schemaPath = path_1.default.join(__dirname, '../../src/db/schema.sql');
    }
    const schema = fs_1.default.readFileSync(schemaPath, 'utf8');
    db.exec(schema);
    const settingsCount = db.prepare('SELECT COUNT(*) as count FROM oee_settings').get();
    if (settingsCount.count === 0) {
        db.prepare(`
      INSERT INTO oee_settings (plant_name, shifts_per_day, hours_per_shift, days_per_week,
        oee_goal, oee_minimum, availability_goal, performance_goal, quality_goal,
        downtime_threshold_minutes, cost_per_hour_usd)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('Manufacturing Plant', 3, 8, 5, 0.82, 0.75, 0.90, 0.95, 0.995, 10, 1000);
    }
    // Runtime migration: add station column if it doesn't exist yet
    try {
        db.exec(`ALTER TABLE raw_incidents ADD COLUMN station TEXT`);
    }
    catch (_) {
        // Column already exists — safe to ignore
    }
    // Runtime migration: create line_oee_uploads if it doesn't exist (pre-schema DBs)
    db.exec(`
    CREATE TABLE IF NOT EXISTS line_oee_uploads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      uploaded_by INTEGER REFERENCES users(id),
      line TEXT NOT NULL,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      total_boards INTEGER,
      first_timestamp DATETIME,
      last_timestamp DATETIME,
      planned_hours REAL,
      availability REAL,
      performance REAL,
      quality REAL,
      oee REAL,
      status TEXT DEFAULT 'active'
    )
  `);
    // Runtime migration: create line_oee_stations if it doesn't exist
    db.exec(`
    CREATE TABLE IF NOT EXISTS line_oee_stations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      upload_id INTEGER REFERENCES line_oee_uploads(id),
      station TEXT NOT NULL,
      total_boards INTEGER,
      produced_qty INTEGER,
      pass_boards INTEGER,
      fail_boards INTEGER,
      tested_boards INTEGER,
      first_timestamp DATETIME,
      last_timestamp DATETIME,
      span_hours REAL,
      actual_run_hours REAL,
      planned_hours REAL,
      available_hours REAL,
      stoppage_count INTEGER,
      stoppage_hours REAL,
      availability REAL,
      performance REAL,
      quality REAL,
      oee REAL,
      mttr REAL,
      mtbf REAL,
      ideal_cycle_time_sec REAL,
      actual_cycle_time_sec REAL,
      el_variant TEXT
    )
  `);
    // Runtime migration: create station_quality_settings if it doesn't exist
    db.exec(`
    CREATE TABLE IF NOT EXISTS station_quality_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      line TEXT NOT NULL,
      week_number INTEGER NOT NULL,
      year INTEGER NOT NULL,
      station_name TEXT NOT NULL,
      manual_qc_rate REAL NOT NULL CHECK(manual_qc_rate >= 0 AND manual_qc_rate <= 1),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(line, week_number, year, station_name)
    )
  `);
    // Runtime migration: create user_requests table
    db.exec(`
    CREATE TABLE IF NOT EXISTS user_requests (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      username         TEXT NOT NULL UNIQUE,
      email            TEXT NOT NULL,
      full_name        TEXT NOT NULL,
      requested_role   TEXT NOT NULL DEFAULT 'viewer',
      reason           TEXT,
      status           TEXT NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      requested_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at      DATETIME,
      reviewed_by      INTEGER REFERENCES users(id)
    )
  `);
    // Runtime migration: create usage_events table + indexes
    db.exec(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      username     TEXT NOT NULL,
      event_type   TEXT NOT NULL,
      event_detail TEXT,
      ip_address   TEXT,
      user_agent   TEXT,
      duration_ms  INTEGER,
      status       TEXT DEFAULT 'success',
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_user_id    ON usage_events(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_created_at ON usage_events(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_event_type ON usage_events(event_type)`);
    // Runtime migrations: add new columns to users if they don't exist
    for (const col of [
        'ALTER TABLE users ADD COLUMN email TEXT DEFAULT \'\'',
        'ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT \'\'',
        'ALTER TABLE users ADD COLUMN last_activity DATETIME',
    ]) {
        try {
            db.exec(col);
        }
        catch (_) { /* column already exists */ }
    }
    // One-time migration: re-stamp all raw_incidents with their upload's dominant week_number/year
    // so that stray incidents near week boundaries don't create phantom week entries.
    const migrationName = 'normalize_incident_week_numbers_v1';
    const alreadyRan = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(migrationName);
    if (!alreadyRan) {
        try {
            const uploads = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active'`).all();
            let fixedCount = 0;
            for (const upload of uploads) {
                // Find the dominant (most frequent) week_number for this upload's incidents
                const weekRows = db.prepare(`
          SELECT week_number, year, COUNT(*) as cnt
          FROM raw_incidents
          WHERE upload_id = ? AND week_number > 0
          GROUP BY week_number, year
          ORDER BY cnt DESC
          LIMIT 1
        `).get(upload.id);
                if (!weekRows)
                    continue;
                // Re-stamp all incidents in this upload that differ from the dominant week
                const result = db.prepare(`
          UPDATE raw_incidents
          SET week_number = ?, year = ?
          WHERE upload_id = ? AND (week_number != ? OR year != ?)
        `).run(weekRows.week_number, weekRows.year, upload.id, weekRows.week_number, weekRows.year);
                fixedCount += result.changes;
            }
            db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migrationName);
            if (fixedCount > 0) {
                logger_1.logger.info(`Migration '${migrationName}': re-stamped ${fixedCount} incident(s) to their upload's dominant week.`);
            }
        }
        catch (err) {
            logger_1.logger.warn(`Migration '${migrationName}' failed (non-fatal):`, { err });
        }
    }
    // Migration: re-derive week numbers from actual report_time dates using
    // corrected ISO 8601 algorithm. The previous getWeekNumber() assigned Sundays
    // to the following week, so some uploads have WK17 stored as the dominant week
    // even though all data belongs to WK16. This migration re-computes from source.
    const migV2 = 'fix_sunday_week_iso_v1';
    const ranV2 = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(migV2);
    if (!ranV2) {
        try {
            // Inline ISO 8601 week calc — mirrors the fixed getWeekNumber() in excel-parser.ts
            const isoWeekFromDate = (dateStr) => {
                if (!dateStr)
                    return null;
                const d = new Date(dateStr);
                if (isNaN(d.getTime()))
                    return null;
                const dayOfWeek = d.getUTCDay() || 7;
                const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - dayOfWeek));
                const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
                const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
                return { week, year: thursday.getUTCFullYear() };
            };
            // Step A: Re-stamp every incident's week_number from its report_time
            const allIncidents = db.prepare(`SELECT id, report_time FROM raw_incidents WHERE report_time IS NOT NULL`).all();
            let correctedCount = 0;
            for (const inc of allIncidents) {
                const w = isoWeekFromDate(inc.report_time);
                if (!w || w.week === 0)
                    continue;
                db.prepare(`UPDATE raw_incidents SET week_number = ?, year = ? WHERE id = ?`)
                    .run(w.week, w.year, inc.id);
                correctedCount++;
            }
            // Step B: Re-run dominant-week normalization per upload so all incidents
            // in the same upload share one canonical week (handles edge-case stragglers)
            const activeUploads = db.prepare(`SELECT id FROM data_uploads WHERE status = 'active'`).all();
            for (const upload of activeUploads) {
                const dominant = db.prepare(`
          SELECT week_number, year, COUNT(*) as cnt
          FROM raw_incidents
          WHERE upload_id = ? AND week_number > 0
          GROUP BY week_number, year
          ORDER BY cnt DESC
          LIMIT 1
        `).get(upload.id);
                if (!dominant)
                    continue;
                db.prepare(`
          UPDATE raw_incidents
          SET week_number = ?, year = ?
          WHERE upload_id = ? AND (week_number != ? OR year != ?)
        `).run(dominant.week_number, dominant.year, upload.id, dominant.week_number, dominant.year);
                // Also update the canonical week on the upload record itself
                db.prepare(`
          UPDATE data_uploads SET week_number = ?, year = ? WHERE id = ?
        `).run(dominant.week_number, dominant.year, upload.id);
            }
            db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migV2);
            logger_1.logger.info(`Migration '${migV2}': re-derived ISO week numbers for ${correctedCount} incidents.`);
        }
        catch (err) {
            logger_1.logger.warn(`Migration '${migV2}' failed (non-fatal):`, { err });
        }
    }
    logger_1.logger.info(`Database initialized at ${dbPath}`);
}
function isFirstRun() {
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return userCount.count === 0;
}
async function createAdminUser(username, password) {
    const hash = await bcryptjs_1.default.hash(password, 12);
    db.prepare(`
    INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')
  `).run(username, hash);
    logger_1.logger.info(`Admin user '${username}' created`);
}
//# sourceMappingURL=init.js.map