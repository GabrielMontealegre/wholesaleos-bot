'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Bundle geography with code so a mutable data-volume mount cannot hide it.
const file = path.join(__dirname, 'county-filter-directory.json');
let cache;
function readCountyFilterCatalog() {
  const stat = fs.statSync(file);
  const key = stat.mtimeMs + '|' + stat.size;
  if (!cache || cache.key !== key) {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value.schema_version !== 1 || !Array.isArray(value.states) || !Array.isArray(value.counties)) throw Error('county_filter_catalog_invalid');
    cache = {key, value};
  }
  return cache.value;
}
function registerCountyFilterCatalog(app, {requireAdmin}) {
  app.get('/api/dashboard/filter-counties', requireAdmin, (_, res) => {
    try { res.set('Cache-Control', 'private, max-age=3600').json(readCountyFilterCatalog()); }
    catch (_) { res.status(503).json({code: 'county_filter_catalog_unavailable'}); }
  });
}
module.exports = {readCountyFilterCatalog, registerCountyFilterCatalog};
