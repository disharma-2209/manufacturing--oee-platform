import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

console.log('\n=== 1. _migrations table ===');
const migs = db.prepare('SELECT * FROM _migrations').all();
console.log(JSON.stringify(migs, null, 2));

console.log('\n=== 2. ALL data_uploads (including inactive/deleted) ===');
const allUploads = db.prepare(`
  SELECT id, original_filename, week_number, year, status, record_count, upload_time
  FROM data_uploads
  ORDER BY id
`).all();
console.log(JSON.stringify(allUploads, null, 2));

console.log('\n=== 3. raw_incidents week distribution — ALL uploads (including inactive) ===');
const allDist = db.prepare(`
  SELECT ri.week_number, ri.year, du.status as upload_status, COUNT(*) as cnt
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  GROUP BY ri.week_number, ri.year, du.status
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(allDist, null, 2));

console.log('\n=== 4. raw_incidents week distribution — ACTIVE uploads only ===');
const activeDist = db.prepare(`
  SELECT ri.week_number, ri.year, COUNT(*) as cnt
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(activeDist, null, 2));

console.log('\n=== 5. data_uploads.week_number column — all active uploads ===');
const uploadWeeks = db.prepare(`
  SELECT id, original_filename, week_number, year, status
  FROM data_uploads
  WHERE status = 'active'
  ORDER BY year DESC, week_number DESC
`).all();
console.log(JSON.stringify(uploadWeeks, null, 2));

console.log('\n=== 6. /analyze/weeks endpoint exact query ===');
// This is the EXACT query from analyze.ts
const weeksEndpoint = db.prepare(`
  SELECT DISTINCT ri.week_number, ri.year, du.id as upload_id, du.original_filename
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active' AND ri.week_number > 0
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(weeksEndpoint, null, 2));

console.log('\n=== 7. Any WK17 incidents — detail ===');
const wk17 = db.prepare(`
  SELECT ri.id, ri.upload_id, ri.week_number, ri.year, ri.report_time,
         du.original_filename, du.status as upload_status
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE ri.week_number = 17
  LIMIT 20
`).all();
console.log(`WK17 incident count: ${wk17.length}`);
console.log(JSON.stringify(wk17, null, 2));

console.log('\n=== 8. WK17 in data_uploads table ===');
const wk17Uploads = db.prepare(`
  SELECT * FROM data_uploads WHERE week_number = 17
`).all();
console.log(JSON.stringify(wk17Uploads, null, 2));

console.log('\n=== 9. Spot-check: Sunday dates in report_time — recompute ISO week ===');
// Find incidents whose report_time falls on a Sunday to confirm ISO calc is correct
const sundays = db.prepare(`
  SELECT ri.id, ri.report_time, ri.week_number, ri.year, du.original_filename
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  LIMIT 1000
`).all();

// Check any that are Sunday (UTC day = 0)
let sundayMismatches = 0;
for (const inc of sundays) {
  if (!inc.report_time) continue;
  const d = new Date(inc.report_time);
  if (d.getUTCDay() === 0) { // Sunday
    const dayOfWeek = 7;
    const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - dayOfWeek));
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const correctWeek = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    if (correctWeek !== inc.week_number) {
      sundayMismatches++;
      if (sundayMismatches <= 5) {
        console.log(`  id=${inc.id} report_time=${inc.report_time} stored_week=${inc.week_number} correct_week=${correctWeek}`);
      }
    }
  }
}
console.log(`Sunday ISO week mismatches found: ${sundayMismatches}`);

db.close();
