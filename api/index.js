// Vercel serverless entry point — wraps the Express app
// Ensure root node_modules (where Vercel installs deps) is on the path
const path = require('path');
const rootModules = path.resolve(__dirname, '../node_modules');
if (!process.env.NODE_PATH || !process.env.NODE_PATH.includes(rootModules)) {
  process.env.NODE_PATH = rootModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '');
  require('module').Module._initPaths();
}

const { app, initDb } = require('../backend/dist/index');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  return app(req, res);
};
