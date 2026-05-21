module.exports = (req, res) => {
  const path = require('path');
  const fs = require('fs');

  const checks = {
    node_version: process.version,
    cwd: process.cwd(),
    dirname: __dirname,
    publicDir_exists: fs.existsSync(path.resolve(__dirname, '../public')),
    backendDist_exists: fs.existsSync(path.resolve(__dirname, '../backend/dist/index.js')),
    better_sqlite3: (() => { try { require('better-sqlite3'); return 'ok'; } catch(e) { return e.message; } })(),
    node_sqlite: (() => { try { require('node:sqlite'); return 'ok'; } catch(e) { return e.message; } })(),
    sqljs: (() => { try { require('sql.js'); return 'ok'; } catch(e) { return e.message; } })(),
    env_DB_PATH: process.env.DB_PATH,
    env_NODE_ENV: process.env.NODE_ENV,
  };

  res.status(200).json(checks);
};
