'use strict';
const path = require('node:path');
const navigation = require('../../dashboard/workspace/navigation');

function registerWorkspacePreview(app) {
  function document(res) {
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; frame-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(path.join(__dirname, '../../dashboard/workspace/index.html'));
  }
  app.get(['/dashboard', '/dashboard/', '/dashboard/index.html'], (req, res) => {
    if (req.query.embedded === '1') {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Security-Policy', "frame-ancestors 'self'");
      return res.sendFile(path.join(__dirname, '../../dashboard/index.html'));
    }
    document(res);
  });
  app.get('/app', (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.query.preview !== '1') return res.redirect(302, navigation.recordHref(req.query.record_ref) || navigation.href(req.query.workspace) || '/dashboard/');
    document(res);
  });
}

module.exports = { registerWorkspacePreview };
