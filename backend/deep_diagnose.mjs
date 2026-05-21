import Database from 'better-sqlite3';

// Open with WAL checkpoint to see all committed data
const db = new Database('data/oee_platform.db');
db.pragma('wal_checkpoint(FULL)');

console.log('\n=== All uploads (all statuses, all IDs) ===');
const uploads = db.prepare(`SELECT id, original_filename, week_number, year, status, record_count, upload_time FROM data_uploads ORDER BY id DESC LIMIT 10`).all();
console.log(JSON.stringify(uploads, null, 2));

console.log('\n=== Week distribution ALL uploads incl active ===');
const dist = db.prepare(`
  SELECT ri.week_number, ri.year, du.id as upload_id, du.original_filename, du.status, COUNT(*) as cnt
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year, du.id
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(dist, null, 2));

console.log('\n=== _migrations ===');
const migs = db.prepare('SELECT * FROM _migrations').all();
console.log(JSON.stringify(migs, null, 2));

db.close();
