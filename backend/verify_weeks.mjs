import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

console.log('=== _migrations table ===');
const migrations = db.prepare('SELECT * FROM _migrations').all();
console.log(JSON.stringify(migrations, null, 2));

console.log('\n=== raw_incidents week distribution (active uploads) ===');
const dist = db.prepare(`
  SELECT ri.week_number, ri.year, COUNT(*) as incident_count
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(dist, null, 2));

console.log('\n=== /analyze/weeks endpoint simulation (dominant week per upload) ===');
const weeks = db.prepare(`
  SELECT du.week_number, du.year, du.id as upload_id, du.original_filename
  FROM data_uploads du
  WHERE du.status = 'active' AND du.week_number > 0
  ORDER BY du.year DESC, du.week_number DESC
`).all();
console.log(JSON.stringify(weeks, null, 2));

db.close();
