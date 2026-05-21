// Vercel serverless entry point — wraps the Express app
const path = require('path');
const fs = require('fs');

// Ensure root node_modules (where Vercel installs deps) is on the path
const rootModules = path.resolve(__dirname, '../node_modules');
if (!process.env.NODE_PATH || !process.env.NODE_PATH.includes(rootModules)) {
  process.env.NODE_PATH = rootModules + (process.env.NODE_PATH ? ':' + process.env.NODE_PATH : '');
  require('module').Module._initPaths();
}

const { app, initDb } = require('../backend/dist/index');
const express = require('express');

// Serve the committed public/ folder as static files
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback for non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  return app(req, res);
};
