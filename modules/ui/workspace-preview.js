'use strict';
const path = require('node:path');

function registerWorkspacePreview(app) {
  app.get('/app', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.query.preview !== '1') return res.redirect(302, '/dashboard/');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, '../../dashboard/workspace/index.html'));
  });
}

module.exports = { registerWorkspacePreview };
