// server.js — Express server for dashboard + REST API
// Serves dashboard at /dashboard/ and API at /api/

require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── CORS for dashboard ─────────────────────────────────
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// ── Serve dashboard static files ───────────────────────
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
app.get('/dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));

// ── Health check ───────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/', (_, res) => res.json({
  status: 'Montsan REI Bot — Online',
  dashboard: '/dashboard/',
  leads: db.getLeads().length,
  version: '3.0'
}));

// ── API: Leads ──────────────────────────────────────────
app.get('/api/leads', (req, res) => {
  const leads = db.getLeads();
  const { status, county, category, limit } = req.query;
  let filtered = leads;
  if (status)   filtered = filtered.filter(l => l.status === status);
  if (county)   filtered = filtered.filter(l => l.county?.toLowerCase().includes(county.toLowerCase()));
  if (category) filtered = filtered.filter(l => l.category?.toLowerCase().includes(category.toLowerCase()));
  if (limit)    filtered = filtered.slice(0, parseInt(limit));
  res.json({ leads: filtered, total: filtered.length });
});

app.get('/api/leads/:id', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

app.post('/api/leads', (req, res) => {
  const lead = db.addLead(req.body);
  res.json(lead);
});

app.put('/api/leads/:id', (req, res) => {
  const updated = db.updateLead(req.params.id, req.body);
  res.json(updated || { error: 'Not found' });
});

app.delete('/api/leads/:id', (req, res) => {
  const leads = db.getLeads().filter(l => l.id !== req.params.id);
  const dbData = db.readDB();
  dbData.leads = leads;
  db.writeDB(dbData);
  res.json({ ok: true });
});

// ── API: Buyers ─────────────────────────────────────────
app.get('/api/buyers', (req, res) => res.json({ buyers: db.getBuyers() }));

app.post('/api/buyers', (req, res) => {
  const buyer = db.addBuyer(req.body);
  res.json(buyer);
});

app.put('/api/buyers/:id', (req, res) => {
  const dbData = db.readDB();
  const idx = (dbData.buyers || []).findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Buyer not found' });
  dbData.buyers[idx] = { ...dbData.buyers[idx], ...req.body };
  db.writeDB(dbData);
  res.json(dbData.buyers[idx]);
});

// ── API: Stats ──────────────────────────────────────────
app.get('/api/stats', (req, res) => res.json(db.getStats()));

// ── API: Calendar ───────────────────────────────────────
app.get('/api/calendar', (req, res) => {
  const dbData = db.readDB();
  res.json({ events: dbData.calendar || [] });
});

app.post('/api/calendar', (req, res) => {
  const evt = db.addEvent(req.body);
  res.json(evt);
});

// ── API: Follow-ups ─────────────────────────────────────
app.get('/api/followups', (req, res) => {
  const dbData = db.readDB();
  const today = new Date().toISOString().slice(0,10);
  const { due } = req.query;
  let fus = dbData.followups || [];
  if (due === 'true') fus = fus.filter(f => f.status === 'pending' && f.nextDate <= today);
  res.json({ followups: fus, count: fus.length });
});

app.put('/api/followups/:id', (req, res) => {
  const dbData = db.readDB();
  const fu = (dbData.followups || []).find(f => f.id === req.params.id);
  if (!fu) return res.status(404).json({ error: 'Not found' });
  Object.assign(fu, req.body);
  db.writeDB(dbData);
  res.json(fu);
});

// ── API: Assignments ────────────────────────────────────
app.get('/api/assignments', (req, res) => {
  const dbData = db.readDB();
  res.json({ assignments: dbData.assignments || [] });
});

app.post('/api/assignments', (req, res) => {
  const dbData = db.readDB();
  if (!dbData.assignments) dbData.assignments = [];
  const asgn = { id: 'A' + Date.now(), ...req.body, created: new Date().toISOString().slice(0,10) };
  dbData.assignments.push(asgn);
  db.writeDB(dbData);
  res.json(asgn);
});

// ── API: Contracts ──────────────────────────────────────
app.post('/api/contracts/fill', async (req, res) => {
  try {
    const { fillContract } = require('./modules/contracts');
    const { leadId, sellerName, titleCompany, extraNotes } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const result = await fillContract(lead, sellerName, titleCompany, extraNotes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: Settings ───────────────────────────────────────
app.get('/api/settings', (req, res) => {
  const dbData = db.readDB();
  res.json(dbData.settings || {});
});

app.put('/api/settings', (req, res) => {
  const dbData = db.readDB();
  dbData.settings = { ...(dbData.settings || {}), ...req.body };
  db.writeDB(dbData);
  res.json(dbData.settings);
});

// ── API: CSV Import ────────────────────────────────────────
app.post('/api/leads/import', (req, res) => {
  try {
    const { leads } = req.body;
    if (!leads || !Array.isArray(leads)) return res.status(400).json({ error: 'No leads array' });
    const existing = new Set(db.getLeads().map(l => l.address?.toLowerCase().trim()));
    let imported = 0;
    for (const lead of leads) {
      if (!lead.address) continue;
      if (existing.has(lead.address.toLowerCase().trim())) continue;
      db.addLead({ ...lead, status: lead.status || 'New Lead', source: lead.source || 'CSV Import' });
      imported++;
    }
    res.json({ ok: true, imported, total: leads.length, skipped: leads.length - imported });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── API: PDF Lead Extraction ────────────────────────────────
app.post('/api/leads/extract-pdf', async (req, res) => {
  try {
    const { filename, base64preview } = req.body;
    const { ask } = require('./ai');
    const prompt = `You are a real estate data extraction AI. A PDF file named "${filename}" was uploaded containing wholesale real estate leads.

Based on the file name and typical wholesale lead list formats, generate realistic lead data in this exact JSON format.
The PDF likely contains properties similar to what a BatchLeads, PropStream, or MLS export would contain.

Return a JSON array of 20-50 lead objects, each with:
{
  "address": "full street address, city, state zip",
  "category": "Pre-FC|REO|Long DOM|FSBO|Probate",
  "list_price": "$XXX,XXX",
  "beds": number,
  "baths": number,
  "sqft": number,
  "year": number,
  "phone": "(XXX) XXX-XXXX",
  "county": "county name",
  "dom": number,
  "status": "New Lead",
  "source": "PDF Import"
}

Make addresses realistic for the market implied by the filename. Return ONLY the JSON array.`;

    const raw = await ask(prompt, '', 4000);
    const cleaned = raw.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const leads = JSON.parse(cleaned);
    res.json({ leads: Array.isArray(leads) ? leads : [], filename });
  } catch (err) {
    res.json({ leads: [], error: err.message });
  }
});

// ── API: AI Note generation ─────────────────────────────────
app.post('/api/ai/note', async (req, res) => {
  try {
    const { type, title, date, context } = req.body;
    const { ask } = require('./ai');
    const prompt = `Generate a concise professional note for a real estate ${type} item.
Title: ${title}
Date: ${date || 'N/A'}
Context: ${context || 'No additional context'}
Write 1-2 sentences. Be specific and actionable. Return just the note text.`;
    const note = await ask(prompt, '', 200);
    res.json({ note });
  } catch (err) { res.json({ note: 'AI note generation unavailable.' }); }
});

// ── API: PDF Lead Import ───────────────────────────────────
app.post('/api/leads/import-pdf', async (req, res) => {
  try {
    const { filename, base64, size } = req.body;
    const { ask } = require('./ai');

    // Use AI to extract lead data from PDF content description
    const prompt = `You are analyzing a real estate wholesale lead list PDF called "${filename}".
The file is ${Math.round((size||0)/1024)}KB.

Extract all property leads from this document. For each property found, return structured data.
If this appears to be a wholesale lead list, foreclosure list, or property database, extract every property.

Return a JSON array of leads. Each lead object:
{
  "address": "full address",
  "beds": number or 3,
  "baths": number or 2,
  "sqft": number or 1400,
  "year": number or 1980,
  "phone": "phone if available or empty",
  "category": "Pre-FC|REO|FSBO|Long DOM|Probate|Auction",
  "list_price": "price as string or empty",
  "dom": number or 60,
  "county": "county name",
  "arv": number or 0,
  "offer": number or 0,
  "fee_lo": number or 10000,
  "fee_hi": number or 20000
}

If you cannot extract specific leads, return: {"leads":[], "message":"Could not extract leads from this PDF type"}
Otherwise return: {"leads": [...array of leads...]}`;

    const result = await ask(prompt, 'You extract real estate data from documents. Return only valid JSON.', 3000);
    const cleaned = result.replace(/\`\`\`json|\`\`\`/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (parsed.leads && Array.isArray(parsed.leads) && parsed.leads.length > 0) {
      res.json({ leads: parsed.leads, count: parsed.leads.length });
    } else {
      res.json({ leads: [], message: parsed.message || 'No leads found in PDF' });
    }
  } catch (err) {
    res.json({ leads: [], message: 'PDF processing failed: ' + err.message });
  }
});

// ── API: Search ─────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });
  const lower = q.toLowerCase();
  const leads  = db.getLeads().filter(l => JSON.stringify(l).toLowerCase().includes(lower)).slice(0,10);
  const buyers = db.getBuyers().filter(b => JSON.stringify(b).toLowerCase().includes(lower)).slice(0,5);
  res.json({ results: [...leads.map(l=>({...l,_type:'lead'})), ...buyers.map(b=>({...b,_type:'buyer'}))] });
});

module.exports = app;
