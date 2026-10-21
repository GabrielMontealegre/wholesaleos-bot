'use strict';
const crypto = require('node:crypto');
const policy = require('./thread-reply-policy');
const { createMailboxReader } = require('./mailbox-reader');
const activity = require('../records/record-activity');
function createSender({ env = process.env, mailer } = {}) {
  const configured = () => { try { policy.address(env.GMAIL_USER); return !!(env.GMAIL_APP_PASSWORD || env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN); } catch { return false; } };
  return { configured, async send(message) {
    if (!configured()) policy.fail('not_configured', 503);
    const auth = env.GMAIL_APP_PASSWORD ? { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, '') }
      : { type: 'OAuth2', user: env.GMAIL_USER, clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN };
    const transport = (mailer || require('nodemailer')).createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth,
      logger: false, debug: false, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000, tls: { rejectUnauthorized: true } });
    try { return await transport.sendMail({ from: env.GMAIL_USER, to: message.to, cc: message.cc, subject: message.subject, text: message.body,
      messageId: message.message_id, inReplyTo: message.anchor, references: [message.anchor], disableFileAccess: true, disableUrlAccess: true }); }
    finally { transport.close(); }
  } };
}
function csrf(req, env) {
  const expected = env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + env.RAILWAY_PUBLIC_DOMAIN : req.protocol + '://' + req.get('host');
  if (req.get('origin') !== expected || req.get('x-wos-reply-request') !== '1' || !/^application\/json(?:\s*;|$)/i.test(req.get('content-type') || '') || req.get('sec-fetch-site') && req.get('sec-fetch-site') !== 'same-origin') policy.fail('csrf_required', 403);
}
function registerRoutes(app, { db, requireAdmin, env = process.env, reader = createMailboxReader({ env }), sender = createSender({ env }), now = () => new Date().toISOString(), timeoutMs = 25000 }) {
  const enabled = () => env.WOS_EMAIL_REPLY_ENABLED === 'true' && env.WOS_EMAIL_REPLY_DISABLED !== 'true';
  const status = () => ({ enabled: enabled(), configured: !!sender.configured(), automatic_send_allowed: false, max_per_hour: policy.HOURLY_CAP });
  function error(res, e, attempted) {
    if (attempted) return res.status(502).json({ code: 'thread_reply_send_uncertain', status: 'unknown', message: 'May have sent. Check Sent; do not retry.' });
    const known = /^thread_reply_[a-z_]+$/.test(e.code || '');
    return res.status(known ? e.status || 400 : 503).json({ code: known ? e.code : 'thread_reply_unavailable' });
  }
  function guard(req, res, next) { try { csrf(req, env); if (!enabled()) policy.fail('disabled', 503); if (!sender.configured()) policy.fail('not_configured', 503); next(); } catch (e) { error(res, e); } }
  function operator(store, id) { if ((store.users || []).filter(u => u.id === id && u.role === 'admin').length !== 1) policy.fail('admin_required', 403); }
  const base = '/api/dashboard/email/thread-replies';
  const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  app.get(base + '/status', noStore, requireAdmin, (req, res) => res.json(status()));
  app.post(base + '/preview', noStore, requireAdmin, guard, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!req.body || Buffer.byteLength(JSON.stringify(req.body)) > 50000) policy.fail('request_invalid');
      if (Object.keys(req.body).some(k => !['message_ids', 'thread_key', 'to', 'cc', 'added_recipients', 'subject', 'body'].includes(k))) policy.fail('request_invalid');
      policy.ids(req.body.message_ids);
      const messages = await reader.messages(req.body.message_ids), store = db.readDBStrict(), at = now();
      operator(store, req.currentUser.id);
      const ctx = policy.context(messages, store, { now: at, own: env.GMAIL_USER, message_ids: req.body.message_ids, thread_key: req.body.thread_key });
      const preview = policy.prepare(req.body, ctx, { now: at, own: env.GMAIL_USER, operatorId: req.currentUser.id });
      // Use the current store after the asynchronous read; no stale DB overwrite.
      const prior = policy.history(store).filter(p => p.version === preview.version);
      if (prior.some(p => ['sending', 'unknown'].includes(p.status))) policy.fail('send_uncertain', 409);
      if (prior.some(p => p.status === 'accepted')) policy.fail('already_accepted', 409);
      const existing = prior.find(p => p.status === 'preview' && policy.fresh(p, now()));
      if (existing) return res.json({ ...existing, ...status() });
      const created = { ...preview, id: crypto.randomUUID(), created_at: now(), source_kind: 'operator_input', status: 'preview', reviewed: false };
      db.writeDB({ ...store, thread_reply_previews: policy.history(store).concat(created) });
      res.json({ ...created, ...status() });
    } catch (e) { error(res, e); }
  });
  app.post(base + '/send', noStore, requireAdmin, guard, async (req, res) => {
    res.set('Cache-Control', 'no-store'); let preview, attempted = false, timer;
    try {
      const input = req.body;
      if (!input || Array.isArray(input) || Object.keys(input).some(k => !['preview_id', 'version', 'reviewed'].includes(k)) || input.reviewed !== true || !/^[a-f0-9-]{36}$/.test(input.preview_id || '') || !/^[a-f0-9]{64}$/.test(input.version || '')) policy.fail('review_required');
      const find = store => { const rows = policy.history(store).filter(p => p.id === input.preview_id && p.version === input.version && p.operator_id === req.currentUser.id); if (rows.length !== 1) policy.fail('preview_missing', 404); return rows[0]; };
      const initial = db.readDBStrict(); preview = find(initial);
      if (preview.status === 'accepted') {
        const receipts = (Array.isArray(initial.thread_reply_receipts) ? initial.thread_reply_receipts : []).filter(r => r.id === preview.id && r.version === preview.version && r.source_kind === 'smtp_delivery' && r.status === 'accepted' && r.message_id === preview.message_id && r.thread_key === preview.thread_key && policy.hash([r.to, r.cc]) === policy.hash([preview.to, preview.cc]) && Number.isFinite(Date.parse(r.sent_at)) && Date.parse(r.sent_at) >= Date.parse(preview.attempted_at) && Date.parse(r.sent_at) <= Date.parse(now()));
        if (receipts.length !== 1) policy.fail('receipt_unavailable', 409);
        return res.json({ status: 'accepted', already_sent: true, message_id: preview.message_id });
      }
      if (preview.status !== 'preview') policy.fail('send_uncertain', 409);
      if (!policy.fresh(preview, now())) policy.fail('preview_expired', 409);
      const messages = await reader.messages(policy.ids(preview.message_ids));
      const store = db.readDBStrict(), current = find(store), at = now();
      operator(store, req.currentUser.id);
      const ctx = policy.context(messages, store, { now: at, own: env.GMAIL_USER, message_ids: preview.message_ids, thread_key: preview.thread_key });
      const message = policy.prepare({ message_ids: preview.message_ids, thread_key: preview.thread_key, to: preview.to, cc: preview.cc, added_recipients: preview.added_recipients, subject: preview.subject, body: preview.body }, ctx, { now: at, own: env.GMAIL_USER, operatorId: req.currentUser.id });
      if (message.version !== preview.version) policy.fail('source_changed', 409);
      if (current.status !== 'preview') policy.fail('send_uncertain', 409);
      if (policy.hash(current) !== policy.hash(preview) || !policy.fresh(current, at)) policy.fail('source_changed', 409);
      if (!enabled()) policy.fail('disabled', 503);
      policy.withinCap(store, at);
      const messageId = '<' + preview.id + '@wholesaleos.local>';
      db.writeDB({ ...store, thread_reply_previews: policy.history(store).map(p => p.id === preview.id ? { ...p, status: 'sending', reviewed: true, reviewed_at: at, attempted_at: at, message_id: messageId } : p) });
      attempted = true;
      const result = await Promise.race([sender.send({ ...message, message_id: messageId }), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('timeout')), timeoutMs); })]);
      const targets = [...message.to, ...message.cc].map(v => v.toLowerCase());
      if (!Array.isArray(result?.accepted) || result.rejected?.length || targets.some(v => !result.accepted.some(a => String(a).toLowerCase() === v))) policy.fail('acceptance_unknown', 502);
      const latest = db.readDBStrict(), saved = find(latest), sentAt = now();
      if (saved.status !== 'sending') policy.fail('attempt_changed', 503);
      if (policy.context(messages, latest, { now: sentAt, own: env.GMAIL_USER, message_ids: preview.message_ids, thread_key: preview.thread_key }).digest !== ctx.digest) policy.fail('attempt_changed', 503);
      const receipt = { id: preview.id, source_kind: 'smtp_delivery', status: 'accepted', message_id: messageId, thread_id: preview.thread_id, thread_key: preview.thread_key, sent_at: sentAt, to: preview.to, cc: preview.cc, operator_id: req.currentUser.id, version: preview.version };
      if (latest.thread_reply_receipts != null && !Array.isArray(latest.thread_reply_receipts)) policy.fail('store_invalid', 503);
      let updated = { ...latest, thread_reply_receipts: (latest.thread_reply_receipts || []).concat(receipt), thread_reply_previews: policy.history(latest).map(p => p.id === preview.id ? { ...p, status: 'accepted', sent_at: sentAt } : p) };
      for (const link of preview.links) updated = activity.recordEvent(updated, link.kind, link.id, 'email_sent', 'Reply accepted by mail server; delivery not confirmed.', { now: sentAt, operatorId: req.currentUser.id }, { channel: 'email', attribution: 'smtp_accepted', reply_receipt: receipt });
      db.writeDB(updated);
      res.json({ status: 'accepted', already_sent: false, message_id: messageId, sent_at: sentAt });
    } catch (e) {
      if (attempted && preview) try { const latest = db.readDBStrict(); db.writeDB({ ...latest, thread_reply_previews: policy.history(latest).map(p => p.id === preview.id && p.status === 'sending' ? { ...p, status: 'unknown' } : p) }); } catch { /* Persisted sending state also blocks retries. */ }
      error(res, e, attempted);
    } finally { clearTimeout(timer); }
  });
}
module.exports = { registerRoutes, createSender, csrf };
