'use strict';

const FLAGS = new Set(['test_data', 'synthetic', 'fixture']);
const REJECTION = Object.freeze({ ok: false, code: 'production_test_data_rejected' });

function hasExplicitTestData(value) {
  const pending = [value], seen = new WeakSet();
  while (pending.length) {
    const row = pending.pop();
    if (!row || typeof row !== 'object' || seen.has(row)) continue;
    seen.add(row);
    for (const key of Object.getOwnPropertyNames(row)) {
      const descriptor = Object.getOwnPropertyDescriptor(row, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) continue;
      if (FLAGS.has(key) && descriptor.value === true) return true;
      if (descriptor.value && typeof descriptor.value === 'object') pending.push(descriptor.value);
    }
  }
  return false;
}

function productionEnvironment(env = process.env) {
  return Boolean(env.RAILWAY_ENVIRONMENT_ID) || !['test', 'development'].includes(env.NODE_ENV);
}

function rejectImport({ production = productionEnvironment() } = {}) {
  return (req, res, next) => {
    if (!production || !hasExplicitTestData(req.body)) return next();
    res.set('Cache-Control', 'no-store');
    return res.status(400).json(REJECTION);
  };
}

function protectRender({ production = productionEnvironment() } = {}) {
  return (req, res, next) => {
    if (production) {
      const json = res.json;
      res.json = function guardedJSON(value) {
        // Reject the whole response; never silently remove records or change counts.
        if (this.statusCode >= 200 && this.statusCode < 300 && hasExplicitTestData(value)) {
          this.set('Cache-Control', 'no-store');
          return json.call(this.status(503), REJECTION);
        }
        return json.call(this, value);
      };
    }
    next();
  };
}

module.exports = { hasExplicitTestData, productionEnvironment, rejectImport, protectRender };
