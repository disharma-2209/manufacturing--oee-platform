import Database from 'better-sqlite3';

const db = new Database('data/oee_platform.db');

const migrationName = 'normalize_incident_week_numbers_v1';

const alreadyRan = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(migrationName);
if (alreadyRan) {
  console.log(`Migration '${migrationName}' already ran. Nothing to do.`);
  db.close();
  process.exit(0);
}

const uploads = db.prepare("SELECT id FROM data_uploads WHERE status = 'active'").all();
let fixedCount = 0;

for (const upload of uploads) {
  const weekRows = db.prepare(`
    SELECT week_number, year, COUNT(*) as cnt
    FROM raw_incidents
    WHERE upload_id = ? AND week_number > 0
    GROUP BY week_number, year
    ORDER BY cnt DESC
    LIMIT 1
  `).get(upload.id);

  if (!weekRows) continue;

  const result = db.prepare(`
    UPDATE raw_incidents
    SET week_number = ?, year = ?
    WHERE upload_id = ? AND (week_number != ? OR year != ?)
  `).run(weekRows.week_number, weekRows.year, upload.id, weekRows.week_number, weekRows.year);

  fixedCount += result.changes;
  if (result.changes > 0) {
    console.log(`  upload_id=${upload.id}: stamped ${result.changes} incidents to WK${weekRows.week_number}/${weekRows.year}`);
  }
}

db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(migrationName);
console.log(`Migration '${migrationName}' complete. ${fixedCount} incident(s) re-stamped.`);

console.log('\n=== Final week distribution ===');
const dist = db.prepare(`
  SELECT ri.week_number, ri.year, COUNT(*) as incident_count
  FROM raw_incidents ri
  JOIN data_uploads du ON ri.upload_id = du.id
  WHERE du.status = 'active'
  GROUP BY ri.week_number, ri.year
  ORDER BY ri.year DESC, ri.week_number DESC
`).all();
console.log(JSON.stringify(dist, null, 2));

console.log('\n=== _migrations table ===');
const migs = db.prepare('SELECT * FROM _migrations').all();
console.log(JSON.stringify(migs, null, 2));

db.close();
