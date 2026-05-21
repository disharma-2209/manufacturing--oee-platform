import Database from 'better-sqlite3';

// Force WAL checkpoint so we can see ALL committed writes
const db = new Database('data/oee_platform.db');
db.pragma('wal_checkpoint(TRUNCATE)');

console.log('=== MAX upload id ===');
const maxId = db.prepare('SELECT MAX(id) as m FROM data_uploads').get();
console.log(maxId);

console.log('\n=== All uploads id >= 34 ===');
const uploads = db.prepare('SELECT id, original_filename, week_number, year, status, record_count, upload_time FROM data_uploads WHERE id >= 34 ORDER BY id').all();
console.log(JSON.stringify(uploads, null, 2));

console.log('\n=== Week dist active ===');
const dist = db.prepare(`
  SELECT ri.week_number, ri.year, du.id as upload_id, du.status, COUNT(*) as cnt
  FROM raw_incidents ri JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year, du.id
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(dist, null, 2));

db.close();
