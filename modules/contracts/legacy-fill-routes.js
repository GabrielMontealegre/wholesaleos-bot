'use strict';

const { fillContract } = require('../contracts');
const INPUTS = new Set(['leadId', 'sellerName', 'titleCompany', 'extraNotes']);

function validInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (Object.keys(body).some(key => !INPUTS.has(key))) return false;
  const id = body.leadId;
  if (!(typeof id === 'string' && id.trim() && id.length <= 256) &&
      !(typeof id === 'number' && Number.isSafeInteger(id) && id > 0)) return false;
  return ['sellerName', 'titleCompany', 'extraNotes'].every(key =>
    body[key] === undefined || (typeof body[key] === 'string' && body[key].length <= (key === 'extraNotes' ? 5000 : 500)));
}

function registerLegacyContractFill(app, { db, requireAdmin }) {
  app.post('/api/contracts/fill', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  }, requireAdmin, async (req, res) => {
    if (!validInput(req.body)) return res.status(400).json({ code: 'contract_fill_input_invalid' });
    try {
      const leads = db.getLeads();
      if (!Array.isArray(leads)) throw new Error('unavailable');
      const matches = leads.filter(lead => lead && lead.id === req.body.leadId);
      if (!matches.length) return res.status(404).json({ code: 'contract_fill_lead_not_found' });
      if (matches.length !== 1) return res.status(409).json({ code: 'contract_fill_lead_ambiguous' });
      const { sellerName, titleCompany, extraNotes } = req.body;
      return res.json(await fillContract(matches[0], sellerName, titleCompany, extraNotes));
    } catch (_) {
      return res.status(503).json({ code: 'contract_fill_unavailable' });
    }
  });
}

module.exports = { registerLegacyContractFill };
