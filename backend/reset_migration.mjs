import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

const before = db.prepare('SELECT * FROM _migrations').all();
console.log('Before delete:', JSON.stringify(before, null, 2));

const result = db.prepare("DELETE FROM _migrations WHERE name = 'normalize_incident_week_numbers_v1'").run();
console.log('Rows deleted:', result.changes);

const after = db.prepare('SELECT * FROM _migrations').all();
console.log('After delete:', JSON.stringify(after, null, 2));

const phantomCheck = db.prepare(`
  SELECT ri.week_number, ri.year, COUNT(*) as cnt
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log('Current raw_incidents week distribution:', JSON.stringify(phantomCheck, null, 2));

db.close();
