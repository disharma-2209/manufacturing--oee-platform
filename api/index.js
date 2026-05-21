// Vercel serverless entry point — wraps the Express app
const { app, initDb } = require('../backend/dist/index');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  return app(req, res);
};
