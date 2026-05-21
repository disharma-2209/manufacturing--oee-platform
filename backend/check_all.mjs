import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('./data/oee_platform.db');

console.log('=== ALL UPLOADS (active + archived) ===');
db.prepare("SELECT id, original_filename, week_number, year, status FROM data_uploads ORDER BY id").all()
  .forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== _MIGRATIONS ===');
db.prepare("SELECT * FROM _migrations").all().forEach(r => console.log(JSON.stringify(r)));
