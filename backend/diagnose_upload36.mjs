import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

console.log('\n=== Upload 35 and 36 details ===');
const uploads = db.prepare(`SELECT * FROM data_uploads WHERE id >= 34 ORDER BY id`).all();
console.log(JSON.stringify(uploads, null, 2));

console.log('\n=== raw_incidents week distribution for upload_id=36 ===');
const dist36 = db.prepare(`
  SELECT week_number, year, COUNT(*) as cnt
  FROM raw_incidents
  WHERE upload_id = 36
  GROUP BY week_number, year
  ORDER BY cnt DESC
`).all();
console.log(JSON.stringify(dist36, null, 2));

console.log('\n=== Sample WK17 incidents from upload_id=36 ===');
const wk17 = db.prepare(`
  SELECT id, report_time, week_number, year, line, equipment
  FROM raw_incidents
  WHERE upload_id = 36 AND week_number = 17
  LIMIT 10
`).all();
console.log(JSON.stringify(wk17, null, 2));

console.log('\n=== Sample WK16 incidents from upload_id=36 ===');
const wk16 = db.prepare(`
  SELECT id, report_time, week_number, year, line, equipment
  FROM raw_incidents
  WHERE upload_id = 36 AND week_number = 16
  LIMIT 5
`).all();
console.log(JSON.stringify(wk16, null, 2));

console.log('\n=== All distinct week_number values across ALL uploads ===');
const allWeeks = db.prepare(`
  SELECT ri.week_number, ri.year, du.id as upload_id, du.original_filename, du.status, COUNT(*) as cnt
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  GROUP BY ri.week_number, ri.year, du.id
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(allWeeks, null, 2));

db.close();
