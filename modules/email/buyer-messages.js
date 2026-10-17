'use strict';

const crypto = require('node:crypto');
const records = require('../records/record-activity');
const types = require('../buyers/buyer-fit');
const eligibility = require('../research/operational-lead-eligibility');
const templates = require('./template-approvals');
const workflow = require('../deals/jv-workflow');
const deals = require('../deals/reviewed-deals');
const MAX_DEALS = 20;
function fail(code, status = 400) { const error = new Error('buyer_email_' + code); error.code = error.message; error.status = status; throw error; }
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function email(value) { return typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value); }
function history(store) {
  if (store.buyer_email_drafts != null && !Array.isArray(store.buyer_email_drafts)) fail('store_invalid', 503);
  return store.buyer_email_drafts || [];
}
function prepare(store, id, input, { now }) {
  if (!input || Array.isArray(input) || Object.keys(input).some(k => !['kind', 'deal_ids'].includes(k)) || !['buyer_buy_box', 'buyer_teaser'].includes(input.kind)) fail('request_invalid');
  const buyers = (store.buyers || []).filter(b => b.id === id);
  if (buyers.length !== 1 || !buyers[0].assistant_find) fail('buyer_missing', 404);
  const buyer = buyers[0], find = buyer.assistant_find;
  if (!types.approvedForMatching(buyer) || !eligibility.buyerEligible(buyer) || find.status === 'not_a_fit') fail('buyer_not_approved', 409);
  const recipient = find.contact_published?.email || find.email;
  if (!email(recipient)) fail('published_email_required', 409);
  const ids = input.deal_ids || [];
  if (!Array.isArray(ids) || ids.length > MAX_DEALS || new Set(ids).size !== ids.length || ids.some(v => typeof v !== 'string' || !v || v.length > 128) || (input.kind === 'buyer_teaser' ? !ids.length : ids.length)) fail('selection_invalid');
  const selected = ids.map(id => {
    const rows = (store.reviewed_deals || []).filter(d => d.id === id);
    if (rows.length !== 1) fail('deal_missing', 404);
    const deal = rows[0], evaluation = deals.evaluate(deal, store.buyers || [], now);
    // Reuse the signed-interest/availability/value gates, not the geographic badge.
    return { deal, teaser: workflow.teaser(deal, evaluation, buyer.id) };
  });
  const subject = input.kind === 'buyer_buy_box' ? 'Your current buying criteria' : ids.length + ' property opportunities for your review';
  const body = input.kind === 'buyer_buy_box'
    ? 'Hello,\n\nWhich areas, property types and price ranges are you buying in now? Please share your repair preferences and closing timeline.\n\nThank you.'
    : selected.map(({ teaser }) => teaser.body).join('\n\n--------------------\n\n') + '\n\nThese are research summaries, not an offer or a promise of availability. Please reply if you would like to discuss one.';
  const message = { kind: input.kind, buyer_id: id, deal_ids: ids, to: recipient, subject, body };
  return { ...message, version: hash([buyer, selected.map(row => row.deal), message]),
    policy: templates.policy(store, input.kind, now), preview_only: true, automatic_send_allowed: false };
}
function createSender({ env = process.env, mailer } = {}) {
  const configured = () => email(env.GMAIL_USER) && !!(env.GMAIL_APP_PASSWORD || env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN);
  return { configured, async send(message) {
    if (!configured()) fail('not_configured', 503);
    const auth = env.GMAIL_APP_PASSWORD
      ? { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, '') }
      : { type: 'OAuth2', user: env.GMAIL_USER, clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken: env.GMAIL_REFRESH_TOKEN };
    const transport = (mailer || require('nodemailer')).createTransport({ host: 'smtp.gmail.com', port: 465, secure: true,
      auth, logger: false, debug: false, connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000,
      tls: { rejectUnauthorized: true } });
    try { return await transport.sendMail({ from: env.GMAIL_USER, to: message.to, subject: message.subject,
      text: message.body, messageId: message.message_id, disableFileAccess: true, disableUrlAccess: true }); }
    finally { transport.close(); }
  } };
}
function registerRoutes(app, { db, requireAdmin, now = () => new Date().toISOString(), sender = createSender() }) {
  const active = new Set();
  function error(res, e) {
    const known = /^buyer_email_[a-z_]+$/.test(e.code || '');
    res.status(known ? e.status || 400 : 409).json({ code: known ? e.code : 'buyer_email_deal_not_ready' });
  }
  app.get('/api/dashboard/buyers-found/:id/email', requireAdmin, (req, res) => {
    try {
      const store = db.readDBStrict();
      if (!(store.buyers || []).some(b => b.id === req.params.id)) fail('buyer_missing', 404);
      res.set('Cache-Control', 'no-store').json({ configured: !!sender.configured(),
        messages: history(store).filter(row => row.buyer_id === req.params.id).slice(-30)
          .map(row => ({ id: row.id, subject: row.subject, body: row.body, status: row.status, created_at: row.created_at, sent_at: row.sent_at || null })) });
    } catch (e) { error(res, e); }
  });
  app.post('/api/dashboard/buyers-found/:id/email/preview', requireAdmin, (req, res) => {
    try { res.set('Cache-Control', 'no-store').json({ ...prepare(db.readDBStrict(), req.params.id, req.body, { now: now() }), configured: !!sender.configured() }); }
    catch (e) { error(res, e); }
  });
  app.post('/api/dashboard/buyers-found/:id/email/draft', requireAdmin, (req, res) => {
    try {
      const input = req.body;
      if (!input || Array.isArray(input) || Object.keys(input).some(k => !['kind', 'deal_ids', 'version'].includes(k))) fail('request_invalid');
      const store = db.readDBStrict(), at = now();
      const message = prepare(store, req.params.id, { kind: input.kind, deal_ids: input.deal_ids }, { now: at });
      if (message.version !== input.version) fail('changed', 409);
      const existing = history(store).find(row => row.operator_id === req.currentUser.id && row.version === message.version && row.status === 'draft' && Date.parse(at) - Date.parse(row.created_at) < 300000);
      if (existing) return res.json({ id: existing.id, status: existing.status });
      const draft = { ...message, id: crypto.randomUUID(), status: 'draft', operator_id: req.currentUser.id, created_at: at };
      let updated = { ...store, buyer_email_drafts: history(store).concat(draft) };
      updated = records.recordEvent(updated, 'buyer', req.params.id, 'email_drafted', 'Operator saved a buyer email draft; not sent.', { now: at, operatorId: req.currentUser.id }, { email_draft_id: draft.id });
      for (const id of draft.deal_ids) updated = records.recordEvent(updated, 'deal', id, 'email_drafted', 'Buyer teaser drafted; not sent.', { now: at, operatorId: req.currentUser.id }, { email_draft_id: draft.id, buyer_id: draft.buyer_id });
      db.writeDB(updated);
      res.json({ id: draft.id, status: 'draft' });
    } catch (e) { error(res, e); }
  });
  app.post('/api/dashboard/buyers-found/:id/email/send', requireAdmin, async (req, res) => {
    let draft, attempted = false;
    try {
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(k => !['draft_id', 'reviewed'].includes(k)) || req.body.reviewed !== true) fail('review_required');
      const at = now(), store = db.readDBStrict();
      const matches = history(store).filter(row => row.id === req.body.draft_id && row.buyer_id === req.params.id && row.operator_id === req.currentUser.id);
      if (matches.length !== 1) fail('draft_missing', 404);
      draft = matches[0];
      if (draft.status === 'accepted') return res.json({ status: 'accepted', already_sent: true });
      if (draft.status !== 'draft' || active.has(draft.id)) fail('attempt_already_started', 409);
      const age = Date.parse(at) - Date.parse(draft.created_at);
      if (!Number.isFinite(age) || age < 0 || age > 300000) fail('preview_expired', 409);
      const current = prepare(store, draft.buyer_id, { kind: draft.kind, deal_ids: draft.deal_ids }, { now: at });
      if (current.version !== draft.version || current.body !== draft.body || current.to !== draft.to || current.subject !== draft.subject) fail('changed', 409);
      if (!sender.configured()) fail('not_configured', 503);
      const approval = { id: draft.id, kind: draft.kind, reviewed: true, source_kind: 'operator_input',
        operator_id: req.currentUser.id, approved_at: at, message_digest: hash([draft.kind, draft.to, draft.subject, draft.body]) };
      const messageId = '<' + draft.id + '@wholesaleos.local>';
      // Persist the attempt before SMTP. Uncertain/crashed attempts never auto-retry.
      db.writeDB({ ...store, email_draft_approvals: (store.email_draft_approvals || []).concat(approval),
        buyer_email_drafts: history(store).map(row => row.id === draft.id ? { ...row, status: 'sending', message_id: messageId } : row) });
      active.add(draft.id); attempted = true;
      const result = await sender.send({ to: draft.to, subject: draft.subject, body: draft.body, message_id: messageId });
      if (!Array.isArray(result?.accepted) || !result.accepted.some(value => String(value).toLowerCase() === draft.to.toLowerCase()) || result.rejected?.length) fail('acceptance_unknown', 502);
      const sentAt = now(); let latest = db.readDBStrict();
      const receipts = latest.email_delivery_receipts || [];
      latest = { ...latest, email_delivery_receipts: receipts.concat({ approval_id: draft.id, kind: draft.kind,
        source_kind: 'smtp_delivery', status: 'accepted', sent_at: sentAt, message_id: messageId, message_digest: approval.message_digest }),
        buyer_email_drafts: history(latest).map(row => row.id === draft.id ? { ...row, status: 'accepted', sent_at: sentAt } : row) };
      const context = { now: sentAt, operatorId: req.currentUser.id };
      const extra = { channel: 'email', attribution: 'smtp_accepted', email_draft_id: draft.id, message_id: messageId };
      latest = records.recordEvent(latest, 'buyer', draft.buyer_id, 'email_sent', 'Email accepted by mail server; delivery not confirmed.', context, extra);
      for (const id of draft.deal_ids) latest = records.recordEvent(latest, 'deal', id, 'email_sent', 'Buyer teaser accepted by mail server; delivery not confirmed.', context, { ...extra, buyer_id: draft.buyer_id });
      db.writeDB(latest);
      res.json({ status: 'accepted', already_sent: false });
    } catch (e) {
      if (attempted && draft) {
        try {
          const latest = db.readDBStrict();
          db.writeDB({ ...latest, buyer_email_drafts: history(latest).map(row => row.id === draft.id && row.status === 'sending' ? { ...row, status: 'unknown' } : row) });
        } catch (_) { /* The persisted sending state also prevents automatic retry. */ }
      }
      if (attempted) res.status(502).json({ code: 'buyer_email_send_uncertain' });
      else error(res, e);
    } finally { if (draft) active.delete(draft.id); }
  });
}
module.exports = { prepare, createSender, registerRoutes, MAX_DEALS };
