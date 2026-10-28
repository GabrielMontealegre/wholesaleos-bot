'use strict';
const path = require('node:path');

// Owner455 promotes the existing native Today shell; classic tools retain their routes.
const APP_HOME = '/app';

function registerAppHome(app, status) {
  app.get('/', (req, res) => {
    // The response depends on Accept, so no cache may reuse the JSON status for a browser visit.
    res.set('Vary', 'Accept');
    res.set('Cache-Control', 'no-store');
    if (req.accepts(['json', 'html']) === 'html') return res.redirect(302, APP_HOME);
    res.json(status());
  });
}

function registerWorkspacePreview(app) {
  app.get('/app', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, '../../dashboard/workspace/index.html'));
  });
}

module.exports = { APP_HOME, registerAppHome, registerWorkspacePreview };
