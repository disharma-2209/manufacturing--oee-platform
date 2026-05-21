import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

console.log('Before:');
console.log(db.prepare('SELECT * FROM _migrations').all());

// Delete both migration guards so they re-run on next backend restart
db.prepare("DELETE FROM _migrations WHERE name IN ('normalize_incident_week_numbers_v1', 'fix_sunday_week_iso_v1')").run();

console.log('\nAfter:');
console.log(db.prepare('SELECT * FROM _migrations').all());

db.close();
console.log('\nDone. Both migration guards deleted — they will re-run on next backend restart.');
