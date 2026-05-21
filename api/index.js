// Vercel serverless entry point — wraps the Express app
const path = require('path');
const fs = require('fs');

// Point the backend's static file serving at the committed public/ folder
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  process.env.FRONTEND_DIST = publicDir;
}

// Ensure root node_modules is on the path for native modules like better-sqlite3
const rootModules = path.resolve(__dirname, '../node_modules');
if (process.env.NODE_PATH !== rootModules) {
  process.env.NODE_PATH = rootModules;
  require('module').Module._initPaths();
}

const { app, initDb } = require('../backend/dist/index');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    try {
      await initDb();
    } catch (e) {
      console.error('initDb failed:', e.message);
    }
    initialized = true;
  }
  return app(req, res);
};
