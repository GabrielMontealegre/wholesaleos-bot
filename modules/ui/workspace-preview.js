'use strict';
const path = require('node:path');

// One stable home (#429): every browser entry point lands on the classic dashboard until each
// rebuilt screen ships. The new shell is opt-in only (`/app?preview=1`).
const APP_HOME = '/dashboard/';

function registerAppHome(app, status) {
  app.get('/', (req, res) => {
    if (req.accepts(['json', 'html']) === 'html') {
      res.set('Cache-Control', 'no-store');
      return res.redirect(302, APP_HOME);
    }
    res.json(status());
  });
}

function registerWorkspacePreview(app) {
  app.get('/app', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.query.preview !== '1') return res.redirect(302, APP_HOME);
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, '../../dashboard/workspace/index.html'));
  });
}

module.exports = { APP_HOME, registerAppHome, registerWorkspacePreview };
