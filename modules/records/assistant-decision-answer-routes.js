'use strict';
const express = require('express');
const { appendAnswer, readAnswers, answerId, publicAnswer } = require('./assistant-decision-answers');
const CODES = new Set(['fields_invalid', 'field_invalid', 'actor_required', 'store_invalid', 'clock_invalid', 'snapshot_stale', 'request_conflict', 'query_invalid']);
function registerDecisionAnswerRoutes(app, { db, requireAdmin, now = () => new Date().toISOString(), limiter = (req, res, next) => next() }) {
  if (typeof requireAdmin !== 'function' || typeof now !== 'function' || typeof limiter !== 'function' || typeof db?.readDBStrict !== 'function' || typeof db?.writeDB !== 'function') throw Error('assistant_answer_dependencies_required');
  const route = '/api/dashboard/assistant-snapshot-answers';
  function error(res, failure) {
    const suffix = typeof failure?.code === 'string' && failure.code.replace(/^assistant_answer_/, '');
    const known = CODES.has(suffix) && failure.code === 'assistant_answer_' + suffix;
    res.status(known ? failure.status || 400 : 503).json({ ok: false, code: known ? failure.code : 'assistant_answer_unavailable' });
  }
  app.all(route, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, requireAdmin, limiter, (req, res, next) => {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, code: 'assistant_answer_method_invalid' });
    if (req.method === 'GET' && (req.get('transfer-encoding') || Number(req.get('content-length') || 0) !== 0)) return res.status(400).json({ ok: false, code: 'assistant_answer_payload_invalid' });
    next();
  });
  app.get(route, (req, res) => {
    try {
      if (Object.keys(req.query).some(key => !['after', 'limit', 'snapshot_id', 'latest_only'].includes(key)) || req.query.limit !== undefined && (typeof req.query.limit !== 'string' || !/^[1-9]\d{0,3}$/.test(req.query.limit)) || req.query.latest_only !== undefined && !['0', '1'].includes(req.query.latest_only)) return res.status(400).json({ ok: false, code: 'assistant_answer_query_invalid' });
      const at = now();
      res.json({ ok: true, now: at, ...readAnswers(db.readDBStrict(), { now: at, operatorId: req.currentUser?.id,
        after: req.query.after === undefined ? null : req.query.after, limit: req.query.limit === undefined ? 100 : Number(req.query.limit),
        snapshotId: req.query.snapshot_id === undefined ? null : req.query.snapshot_id, latestOnly: req.query.latest_only === '1' }) });
    } catch (failure) { error(res, failure); }
  });
  app.post(route, (req, res, next) => {
    try {
      const origin = new URL(req.get('origin')), expected = new URL(req.protocol + '://' + req.get('host')).origin;
      if (origin.origin !== expected || origin.href !== origin.origin + '/' || req.get('X-WOS-Assistant-Answer') !== '1') throw Error();
    } catch (_) { return res.status(403).json({ ok: false, code: 'assistant_answer_origin_required' }); }
    if (!req.is('application/json')) return res.status(415).json({ ok: false, code: 'assistant_answer_content_type_required' });
    next();
  }, express.json({ strict: true, limit: '8kb' }), (req, res) => {
    try {
      const before = db.readDBStrict(), operatorId = req.currentUser?.id, at = now();
      const after = appendAnswer(before, req.body, { now: at, operatorId });
      if (after !== before) db.writeDB(after);
      const id = answerId(operatorId, req.body.request_id), row = after.assistant_decision_answers.find(answer => answer.id === id);
      res.json({ ok: true, now: at, answer: publicAnswer(row) });
    } catch (failure) { error(res, failure); }
  }, (failure, req, res, next) => {
    if (failure?.type === 'entity.too.large') return res.status(413).json({ ok: false, code: 'assistant_answer_payload_too_large' });
    if (failure?.type === 'entity.parse.failed') return res.status(400).json({ ok: false, code: 'assistant_answer_payload_invalid' });
    error(res, failure);
  });
}
module.exports = { registerDecisionAnswerRoutes };
