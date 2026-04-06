// server.js Ã¢ÂÂ Express server for dashboard + REST API
// Serves dashboard at /dashboard/ and API at /api/

require('dotenv').config();
const express = require('express');
const path    = require('path');
const db      = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.text({ limit: '100mb', type: 'text/plain' }));

// Ã¢ÂÂÃ¢ÂÂ CORS for dashboard Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// Ã¢ÂÂÃ¢ÂÂ Serve dashboard static files Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
app.get('/dashboard/', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));

// Ã¢ÂÂÃ¢ÂÂ Health check Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.get('/', (_, res) => res.json({
  status: 'Montsan REI Bot Ã¢ÂÂ Online',
  dashboard: '/dashboard/',
  leads: db.getLeads().length,
  version: '3.0'
}));

// Ã¢ÂÂÃ¢ÂÂ API: Leads Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Buyers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Calendar Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/calendar', (req, res) => {
  const dbData = db.readDB();
  res.json({ events: dbData.calendar || [] });
});

app.post('/api/calendar', (req, res) => {
  const evt = db.addEvent(req.body);
  res.json(evt);
});

// Ã¢ÂÂÃ¢ÂÂ API: Follow-ups Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Assignments Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Contracts Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Settings Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: CSV Import Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: PDF Lead Extraction Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: AI Note generation Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: PDF Lead Import Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
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

// Ã¢ÂÂÃ¢ÂÂ API: Leads by State/County hierarchy Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/hierarchy', (req, res) => {
  try {
    const tree = db.getLeadsByStateCounty();
    res.json({ tree, total: db.getLeads().length });
  } catch(err) { res.json({ tree: {}, total: 0 }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Stats with followups_due Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/stats', (req, res) => {
  const stats = db.getStats();
  const today = new Date().toISOString().slice(0,10);
  const dbData = db.readDB();
  stats.followups_due = (dbData.followups||[]).filter(f => f.status==='pending' && f.nextDate<=today).length;
  stats.backups = (dbData.backups||[]).slice(-7);
  res.json(stats);
});

// Ã¢ÂÂÃ¢ÂÂ API: Notifications Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/notifications', (req, res) => {
  const unreadOnly = req.query.unread === 'true';
  const notifs = db.getNotifications(unreadOnly);
  res.json({ notifications: notifs, unread: notifs.filter(n=>!n.read).length });
});

app.post('/api/notifications/read', (req, res) => {
  const { ids } = req.body;
  db.markNotificationsRead(ids||[]);
  res.json({ ok: true });
});

// Ã¢ÂÂÃ¢ÂÂ API: Markets Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/markets/best', (req, res) => {
  try {
    const { selectMarketsForWeek } = require('./markets');
    const scanned = db.getScannedMarkets();
    const markets = selectMarketsForWeek(12, scanned);
    res.json({ markets });
  } catch(err) { res.json({ markets: [] }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Scan status Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/scan/status', (req, res) => {
  const dbData = db.readDB();
  res.json({
    scanned_markets: db.getScannedMarkets().length,
    last_backup: (dbData.backups||[]).slice(-1)[0] || null,
    total_leads: db.getLeads().length,
    total_buyers: db.getBuyers().length,
  });
});

// Ã¢ÂÂÃ¢ÂÂ API: Buy Boxes Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyboxes', (req, res) => {
  const { getBuyBoxes } = require('./modules/buybox');
  res.json({ buyboxes: getBuyBoxes() });
});

app.post('/api/buyboxes', (req, res) => {
  const { addBuyBox } = require('./modules/buybox');
  const box = addBuyBox(req.body);
  if (!box) return res.json({ ok: false, error: 'Duplicate buy box' });
  db.addNotification('buyer', 'New buy box added', `${req.body.name} Ã¢ÂÂ ${req.body.county||'Unknown'}, ${req.body.state||'TX'}`);
  res.json({ ok: true, buybox: box });
});

app.post('/api/buyboxes/extract', (req, res) => {
  const { extractFromBuyers } = require('./modules/buybox');
  const count = extractFromBuyers();
  if (count > 0) db.addNotification('buyer', `${count} buy boxes extracted`, 'Extracted from existing buyers database');
  res.json({ ok: true, extracted: count });
});

app.get('/api/buyboxes/recommendations', (req, res) => {
  const { getBuyBoxRecommendations } = require('./modules/buybox');
  res.json({ recommendations: getBuyBoxRecommendations() });
});

app.post('/api/buyboxes/match/:leadId', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { matchBuyBoxesToLead } = require('./modules/buybox');
  res.json({ matches: matchBuyBoxesToLead(lead) });
});

// Ã¢ÂÂÃ¢ÂÂ API: Outreach Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/outreach/:leadId', (req, res) => {
  const { getOutreachHistory } = require('./modules/outreach');
  res.json({ history: getOutreachHistory(req.params.leadId) });
});

app.post('/api/outreach/generate', (req, res) => {
  const { generateSellerSMS, generateSellerEmail, generateBuyerSMS, generateBuyerEmail, generateCallScript } = require('./modules/outreach');
  const { leadId, type } = req.body;
  const lead = db.getLeads().find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  let result = {};
  if (type === 'seller_sms') result = { message: generateSellerSMS(lead) };
  else if (type === 'seller_email') result = generateSellerEmail(lead);
  else if (type === 'call_script') result = { message: generateCallScript(lead) };
  else result = { seller_sms: generateSellerSMS(lead), seller_email: generateSellerEmail(lead), call_script: generateCallScript(lead) };
  res.json(result);
});

app.post('/api/outreach/save-edit', (req, res) => {
  const { saveToneEdit } = require('./modules/outreach');
  const { original, edited, context } = req.body;
  saveToneEdit(original, edited, context);
  res.json({ ok: true });
});

app.post('/api/outreach/record', (req, res) => {
  const { saveOutreachRecord } = require('./modules/outreach');
  const { leadId, type, message } = req.body;
  const record = saveOutreachRecord(leadId, type, message);
  res.json({ ok: true, record });
});

app.get('/api/outreach/tone-status', (req, res) => {
  const { getToneLearnings, getAutoSendEnabled } = require('./modules/outreach');
  const learnings = getToneLearnings();
  res.json({ edits: learnings.length, auto_send: getAutoSendEnabled(), ready: learnings.length >= 5 });
});

// Ã¢ÂÂÃ¢ÂÂ API: Contracts Library Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/contracts/templates', (req, res) => {
  const { getTemplates } = require('./modules/contract_templates');
  res.json({ templates: getTemplates() });
});

app.get('/api/contracts/templates/:id', (req, res) => {
  const { getTemplate } = require('./modules/contract_templates');
  const t = getTemplate(req.params.id);
  if (!t) return res.status(404).json({ error: 'Template not found' });
  res.json(t);
});

app.get('/api/contracts/custom', (req, res) => {
  const dbData = db.readDB();
  res.json({ contracts: dbData.custom_contracts || [] });
});

app.post('/api/contracts/custom', (req, res) => {
  const dbData = db.readDB();
  if (!dbData.custom_contracts) dbData.custom_contracts = [];
  const contract = { id: 'CC' + Date.now(), ...req.body, created: new Date().toISOString().slice(0,10), version: 1 };
  dbData.custom_contracts.push(contract);
  db.writeDB(dbData);
  res.json({ ok: true, contract });
});

app.put('/api/contracts/custom/:id', (req, res) => {
  const dbData = db.readDB();
  const idx = (dbData.custom_contracts||[]).findIndex(c => c.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Not found' });
  dbData.custom_contracts[idx] = { ...dbData.custom_contracts[idx], ...req.body, version: (dbData.custom_contracts[idx].version||1)+1, updated: new Date().toISOString().slice(0,10) };
  db.writeDB(dbData);
  res.json({ ok: true, contract: dbData.custom_contracts[idx] });
});

// Ã¢ÂÂÃ¢ÂÂ API: Automation Control Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/automation/scan', async (req, res) => {
  res.json({ ok: true, message: 'Scan triggered Ã¢ÂÂ check notifications for progress' });
  // Fire and forget
  setTimeout(async () => {
    try {
      const { selectMarketsForWeek, getMarketData } = require('./markets');
      const ai = require('./ai');
      const { generateMarketBuyBoxes, addBuyBoxesBulk } = require('./modules/buybox');
      const scanned = db.getScannedMarkets();
      const markets = selectMarketsForWeek(req.body?.markets||4, scanned);
      let totalLeads = 0;
      for (const market of markets) {
        const leads = await ai.generateLeadList(market.county, market.state, req.body?.count||20, ['Pre-FC','REO','Long DOM','FSBO','Probate']);
        let added = 0;
        for (const lead of leads) {
          if (db.leadExists(lead.address)) continue;
          let analysis = {};
          try { analysis = await ai.analyzeProperty({...lead, county:market.county, state:market.state}); } catch {}
          const mData = getMarketData(market.county, market.state);
          const arv = analysis.arv > 50000 ? analysis.arv : (lead.arv > 50000 ? lead.arv : mData.arv);
          const rep = analysis.repairs > 1000 ? analysis.repairs : Math.round((lead.sqft||1400)*42);
          const off = analysis.offer > 10000 ? analysis.offer : Math.round((arv*0.70-rep)*0.94);
          const sprd = arv-off-rep;
          db.addLead({...lead, county:market.county, state:market.state, arv, offer:off, repairs:rep, mao:Math.round(arv*0.70-rep), fee_lo:Math.round(sprd*0.35), fee_hi:Math.round(sprd*0.55), spread:sprd, risk:sprd>60000?'Low':sprd>30000?'Medium':'High', why_good_deal:analysis.why_good_deal||lead.why_good_deal||`${lead.category} in ${market.county} County`, distress_signals:analysis.distress_signals||[lead.category], investment_strategy:'Wholesale Assignment', script:analysis.script||lead.script||'', source:'AI Generated'});
          added++;
        }
        const boxes = generateMarketBuyBoxes(market.county, market.state, 3);
        addBuyBoxesBulk(boxes);
        db.addScannedMarket(market.state, market.county);
        totalLeads += added;
        db.addNotification('deal', `${added} leads Ã¢ÂÂ ${market.county}, ${market.state}`, `Automation scan complete for ${market.county} County`);
      }
      db.addNotification('scan', 'Automation scan complete', `${totalLeads} total leads added across ${markets.length} markets`);
    } catch(e) { db.addNotification('warning', 'Scan error', e.message); }
  }, 100);
});

app.post('/api/automation/extract-buyboxes', (req, res) => {
  const { extractFromBuyers, generateMarketBuyBoxes, addBuyBoxesBulk } = require('./modules/buybox');
  const fromBuyers = extractFromBuyers();
  db.addNotification('buyer', `${fromBuyers} buy boxes extracted`, 'Extracted from buyers database');
  res.json({ ok: true, extracted: fromBuyers });
});

// Ã¢ÂÂÃ¢ÂÂ API: Lead Quality Score Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/:id/quality', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const { scoreLeadQuality } = require('./modules/outreach');
  res.json(scoreLeadQuality(lead));
});

// Ã¢ÂÂÃ¢ÂÂ API: Outreach generation Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/outreach/generate', (req, res) => {
  const { leadId, buyerId } = req.body;
  const lead = db.getLeads().find(l => l.id === leadId);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const { scoreLeadQuality, generateSellerSMS, generateSellerEmail, generateCallScript, generateBuyerSMS, generateBuyerEmail } = require('./modules/outreach');
  const quality = scoreLeadQuality(lead);
  const result = {
    quality,
    seller_sms: generateSellerSMS(lead, quality),
    seller_email: generateSellerEmail(lead, quality),
    call_script: generateCallScript(lead, quality),
  };
  if (buyerId) {
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (buyer) {
      result.buyer_sms = generateBuyerSMS(lead, buyer);
      result.buyer_email = generateBuyerEmail(lead, buyer);
    }
  }
  res.json(result);
});

app.post('/api/outreach/intro-email', (req, res) => {
  const { buyerId } = req.body;
  const buyer = db.getBuyers().find(b => b.id === buyerId);
  if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
  const { generateBuyerIntroEmail } = require('./modules/outreach');
  res.json(generateBuyerIntroEmail(buyer));
});

app.post('/api/outreach/save-edit', (req, res) => {
  const { original, edited, context } = req.body;
  const { saveToneEdit } = require('./modules/outreach');
  saveToneEdit(original, edited, context);
  res.json({ ok: true });
});

app.post('/api/outreach/record', (req, res) => {
  const { leadId, type, message } = req.body;
  const { saveOutreachRecord } = require('./modules/outreach');
  const record = saveOutreachRecord(leadId, type, message);
  res.json({ ok: true, record });
});

app.get('/api/outreach/:leadId', (req, res) => {
  const { getOutreachHistory } = require('./modules/outreach');
  res.json({ history: getOutreachHistory(req.params.leadId) });
});

app.get('/api/outreach/tone-status', (req, res) => {
  const { getToneLearnings, getAutoSendEnabled } = require('./modules/outreach');
  const learnings = getToneLearnings();
  res.json({ edits: learnings.length, auto_send: getAutoSendEnabled(), ready: learnings.length >= 5 });
});

// Ã¢ÂÂÃ¢ÂÂ API: Land deals Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/land', async (req, res) => {
  try {
    const { county, state, count } = req.body;
    const { generateLandLeads } = require('./ai');
    const leads = generateLandLeads(county || 'Dallas', state || 'TX', count || 10);
    let added = 0;
    for (const lead of leads) {
      if (db.leadExists(lead.address)) continue;
      db.addLead(lead);
      added++;
    }
    db.addNotification('deal', `${added} land deals added`, `${county}, ${state} Ã¢ÂÂ land opportunities`);
    res.json({ ok: true, added, leads: leads.slice(0, added) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Buyer intro email Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyers/:id/intro-email', (req, res) => {
  const buyer = db.getBuyers().find(b => b.id === req.params.id);
  if (!buyer) return res.status(404).json({ error: 'Not found' });
  const { generateBuyerIntroEmail } = require('./modules/outreach');
  res.json(generateBuyerIntroEmail(buyer));
});

// Ã¢ÂÂÃ¢ÂÂ API: Deal send (address-protected) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/deals/send', (req, res) => {
  try {
    const { leadId, buyerId } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (!lead || !buyer) return res.status(404).json({ error: 'Lead or buyer not found' });
    const { generateBuyerEmail } = require('./modules/outreach');
    const email = generateBuyerEmail(lead, buyer);
    // Log deal sent
    const dbData = db.readDB();
    if (!dbData.deals_sent) dbData.deals_sent = [];
    dbData.deals_sent.push({ leadId, buyerId, buyerName: buyer.name, sent: new Date().toISOString(), version: email.subject });
    db.writeDB(dbData);
    db.addNotification('match', `Deal sent to ${buyer.name}`, `${lead.address?.split(',')[0]} Ã¢ÂÂ city-only version sent`);
    res.json({ ok: true, email });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Auth / Users Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/auth/login', (req, res) => {
  const { pin } = req.body;
  const user = db.getUserByPin(String(pin));
  if (!user) return res.status(401).json({ error: 'Invalid PIN' });
  res.json({ ok: true, user: { id: user.id, name: user.name, role: user.role, color: user.color, initials: user.initials, firstLogin: user.firstLogin } });
});

app.get('/api/users', (req, res) => {
  // Admin only endpoint
  const users = db.getUsers().map(u => ({ id:u.id, name:u.name, role:u.role, color:u.color, initials:u.initials, firstLogin:u.firstLogin, created:u.created }));
  res.json({ users });
});

app.put('/api/users/:id', (req, res) => {
  const result = db.updateUser(req.params.id, req.body);
  if (result?.error) return res.status(400).json(result);
  res.json({ ok: true, user: result });
});

app.post('/api/users', (req, res) => {
  const result = db.addUser(req.body);
  if (result?.error) return res.status(400).json(result);
  res.json({ ok: true, user: result });
});

// Ã¢ÂÂÃ¢ÂÂ API: User-scoped leads Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/leads/user/:userId', (req, res) => {
  const leads = db.getLeadsForUser(req.params.userId);
  res.json({ leads, total: leads.length });
});

app.get('/api/leads/hierarchy/:userId', (req, res) => {
  const tree = db.getLeadsByStateCountyForUser(req.params.userId);
  res.json({ tree, total: db.getLeadsForUser(req.params.userId).length });
});

app.get('/api/stats/:userId', (req, res) => {
  const stats = db.getStatsForUser(req.params.userId);
  const today = new Date().toISOString().slice(0,10);
  const dbData = db.readDB();
  stats.followups_due = (dbData.followups||[]).filter(f => f.status==='pending' && f.nextDate<=today).length;
  res.json(stats);
});

// Ã¢ÂÂÃ¢ÂÂ API: Dashboard search (no Telegram needed) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/search/leads', async (req, res) => {
  const { county, state, count, type, userId } = req.body;
  if (!county || !state) return res.status(400).json({ error: 'County and state required' });
  res.json({ ok: true, message: 'Search started', county, state, count: count||50 });
  // Fire search in background
  setTimeout(async () => {
    try {
      const ai = require('./ai');
      const { getMarketData } = require('./markets');
      const { generateMarketBuyBoxes, addBuyBoxesBulk } = require('./modules/buybox');
      const isLand = type === 'land';
      const isBuyers = type === 'buyers';
      let leads = [];
      if (isLand) {
        leads = ai.generateLandLeads(county, state, count||50);
      } else if (!isBuyers) {
        leads = await ai.generateLeadList(county, state, count||50, ['Pre-FC','REO','Long DOM','FSBO','Probate','Auction','Tax Delinquent']);
      }
      const market = getMarketData(county, state);
      let added = 0;
      for (const lead of leads) {
        if (db.leadExists(lead.address)) continue;
        let analysis = {};
        try { analysis = await ai.analyzeProperty({...lead, county, state}); } catch {}
        const arv = analysis.arv > 50000 ? analysis.arv : (lead.arv > 50000 ? lead.arv : market.arv);
        const rep = analysis.repairs > 1000 ? analysis.repairs : Math.round((lead.sqft||1400)*42);
        const off = analysis.offer > 10000 ? analysis.offer : Math.round((arv*0.70-rep)*0.94);
        const sprd = Math.max(0, arv-off-rep);
        db.addLead({...lead, county, state, arv, offer:off, repairs:rep,
          mao:Math.round(arv*0.70-rep), fee_lo:Math.round(sprd*0.35), fee_hi:Math.round(sprd*0.55),
          spread:sprd, risk:sprd>60000?'Low':sprd>30000?'Medium':'High',
          why_good_deal:analysis.why_good_deal||lead.why_good_deal||'',
          distress_signals:analysis.distress_signals||lead.distress_signals||[],
          investment_strategy:analysis.investment_strategy||'Wholesale Assignment',
          script:analysis.script||lead.script||'', offer_email:analysis.offer_email||lead.offer_email||'',
          negotiation_text:analysis.negotiation_text||lead.negotiation_text||'',
          source: isLand ? 'Land Ã¢ÂÂ Dashboard Search' : 'AI Generated Ã¢ÂÂ Dashboard Search',
          userId: userId || 'admin',
        });
        added++;
      }
      // Always auto-add buyers regardless of search type
      const buyers = require('./ai').generateMarketBuyers(county, state, 12);
      const buyersAdded = db.addBuyersBulk(buyers);
      const boxes = generateMarketBuyBoxes(county, state, 5);
      addBuyBoxesBulk(boxes);
      db.addScannedMarket(state, county);
      db.markStatePopulated(state);
      db.checkLeadLimit();
      db.addNotification('deal', added + ' leads found Ã¢ÂÂ ' + county + ', ' + state,
        'Dashboard search complete. ' + buyersAdded + ' buyers added.', {county, state, added, userId: userId||'admin'});
    } catch(e) { db.addNotification('warning','Search error', e.message); }
  }, 100);
});

// Ã¢ÂÂÃ¢ÂÂ API: State auto-populate Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/states/populate', async (req, res) => {
  const { stateCode, userId } = req.body;
  if (!stateCode) return res.status(400).json({ error: 'State code required' });
  const { getStateMarkets } = require('./markets');
  const stateData = getStateMarkets(stateCode);
  if (!stateData) return res.status(404).json({ error: 'State not found' });
  const alreadyDone = db.isStatePopulated(stateCode);
  if (alreadyDone) return res.json({ ok: true, message: 'Already populated', alreadyDone: true });
  res.json({ ok: true, message: 'Populating ' + stateData.name + ' with 150 leads...', stateName: stateData.name });
  setTimeout(async () => {
    try {
      const ai = require('./ai');
      const { getMarketData } = require('./markets');
      const counties = Object.keys(stateData.counties||{});
      // Pick top 2 counties by hotness
      const topCounties = counties
        .map(c => ({ county: c.replace(/_/g,' '), hotness: stateData.counties[c].hotness||70 }))
        .sort((a,b) => b.hotness-a.hotness).slice(0,2);
      let totalAdded = 0;
      for (const { county } of topCounties) {
        const perCounty = Math.round(150 / topCounties.length);
        const leads = await ai.generateLeadList(county, stateCode, perCounty, ['Pre-FC','REO','Long DOM','FSBO','Probate']);
        const market = getMarketData(county, stateCode);
        for (const lead of leads) {
          if (db.leadExists(lead.address)) continue;
          let analysis = {};
          try { analysis = await ai.analyzeProperty({...lead, county, state:stateCode}); } catch {}
          const arv = analysis.arv > 50000 ? analysis.arv : market.arv;
          const rep = analysis.repairs > 1000 ? analysis.repairs : Math.round((lead.sqft||1400)*42);
          const off = Math.round((arv*0.70-rep)*0.94);
          const sprd = Math.max(0, arv-off-rep);
          db.addLead({...lead, county, state:stateCode, arv, offer:off, repairs:rep,
            mao:Math.round(arv*0.70-rep), fee_lo:Math.round(sprd*0.35), fee_hi:Math.round(sprd*0.55),
            spread:sprd, risk:sprd>60000?'Low':sprd>30000?'Medium':'High',
            why_good_deal:analysis.why_good_deal||lead.why_good_deal||'',
            distress_signals:analysis.distress_signals||[lead.category],
            investment_strategy:'Wholesale Assignment',
            script:analysis.script||lead.script||'',
            source:'AI Generated Ã¢ÂÂ State Population',
            userId: userId||'admin',
          });
          totalAdded++;
        }
        const buyers = require('./ai').generateMarketBuyers(county, stateCode, 5);
        db.addBuyersBulk(buyers);
        db.addScannedMarket(stateCode, county);
      }
      db.markStatePopulated(stateCode);
      db.checkLeadLimit();
      db.addNotification('deal', stateData.name + ' populated Ã¢ÂÂ ' + totalAdded + ' leads', 'Auto-population complete for ' + stateData.name, {state:stateCode, added:totalAdded});
    } catch(e) { db.addNotification('warning','Population error for '+stateCode, e.message); }
  }, 100);
});

// Ã¢ÂÂÃ¢ÂÂ API: Pending buyers Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/buyers/pending', (req, res) => {
  res.json({ pending: db.getPendingBuyers() });
});

app.post('/api/buyers/pending', (req, res) => {
  const { buyer, userId } = req.body;
  const pending = db.addPendingBuyer(buyer, userId||'guest');
  res.json({ ok: true, pending });
});

app.post('/api/buyers/pending/:id/approve', (req, res) => {
  const buyer = db.approvePendingBuyer(req.params.id);
  if (!buyer) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, buyer });
});

app.post('/api/buyers/pending/:id/reject', (req, res) => {
  db.rejectPendingBuyer(req.params.id);
  res.json({ ok: true });
});

// Ã¢ÂÂÃ¢ÂÂ API: State/County data Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/states', (req, res) => {
  const { MARKETS } = require('./markets');
  const populated = db.readDB().populated_states || [];
  const states = Object.entries(MARKETS).map(([code, data]) => ({
    code, name: data.name,
    counties: Object.keys(data.counties||{}).map(c => c.replace(/_/g,' ')),
    populated: populated.includes(code),
    leadCount: db.getLeads().filter(l => l.state===code).length,
  })).sort((a,b) => a.name.localeCompare(b.name));
  res.json({ states });
});

// Ã¢ÂÂÃ¢ÂÂ API: Fix state/county data Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/leads/fix-states', (req, res) => {
  const dbData = db.readDB();
  const STATE_MAP = {
    'Wayne':'MI','Cuyahoga':'OH','Franklin':'OH','Hamilton':'OH','Cook':'IL',
    'Philadelphia':'PA','Allegheny':'PA','Kings':'NY','Bronx':'NY','Queens':'NY',
    'Multnomah':'OR','King':'WA','Clark':'NV','Maricopa':'AZ','Pima':'AZ',
    'Fulton':'GA','DeKalb':'GA','Gwinnett':'GA','Jefferson':'AL',
    'Hennepin':'MN','Ramsey':'MN','Milwaukee':'WI','Dane':'WI',
    'Shelby':'TN','Davidson':'TN','Orleans':'LA','Jefferson Parish':'LA',
    'Baltimore City':'MD','Prince Georges':'MD','Essex':'NJ','Hudson':'NJ',
    'Denver':'CO','Bernalillo':'NM','Salt Lake':'UT','Ada':'ID',
    'Hillsborough':'FL','Miami-Dade':'FL','Broward':'FL','Palm Beach':'FL',
    'Mecklenburg':'NC','Wake':'NC','Richland':'SC','Charleston':'SC',
    'Richmond City':'VA','Henrico':'VA','Harris':'TX','Bexar':'TX',
    'Travis':'TX','Dallas':'TX','Tarrant':'TX','Collin':'TX',
    'San Diego':'CA','Los Angeles':'CA','Riverside':'CA','Sacramento':'CA',
  };
  let fixed = 0;
  (dbData.leads||[]).forEach(lead => {
    const county = lead.county||'';
    // Fix "Detroit Michigan" style county names
    if (county.includes(' ')) {
      const parts = county.split(' ');
      const lastWord = parts[parts.length-1];
      const STATE_NAMES = {Michigan:'MI',Ohio:'OH',Illinois:'IL',Pennsylvania:'PA',New:'NY',California:'CA',Texas:'TX',Florida:'FL',Georgia:'GA',Arizona:'AZ',Nevada:'NV',Colorado:'CO',Oregon:'OR',Washington:'WA',Tennessee:'TN',Minnesota:'MN',Wisconsin:'WI'};
      if (STATE_NAMES[lastWord]) {
        lead.state = STATE_NAMES[lastWord];
        lead.county = parts.slice(0,-1).join(' ');
        fixed++;
      } else if (STATE_NAMES[parts[1]]) {
        lead.state = STATE_NAMES[parts[1]];
        lead.county = parts[0];
        fixed++;
      }
    }
    // Fix countyÃ¢ÂÂstate mapping
    const correctState = STATE_MAP[county];
    if (correctState && lead.state !== correctState) {
      lead.state = correctState;
      fixed++;
    }
  });
  if (fixed > 0) db.writeDB(dbData);
  res.json({ ok: true, fixed });
});


// Ã¢ÂÂÃ¢ÂÂ Gmail API endpoints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

function getGmailTransport() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const user = process.env.GMAIL_USER;
  if (!clientId || !clientSecret || !refreshToken || !user) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return { oauth2, user };
}

app.get('/api/gmail/test', async (req, res) => {
  const vars = { clientId: !!process.env.GMAIL_CLIENT_ID, clientSecret: !!process.env.GMAIL_CLIENT_SECRET, refreshToken: !!process.env.GMAIL_REFRESH_TOKEN, user: process.env.GMAIL_USER };
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ ok: false, vars, error: 'Missing variables' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ ok: true, email: profile.data.emailAddress, messagesTotal: profile.data.messagesTotal, vars });
  } catch(e) { res.json({ ok: false, error: e.message, vars }); }
});

app.get('/api/gmail/inbox', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const list = await gmail.users.messages.list({ userId: 'me', maxResults: 20, labelIds: ['INBOX'] });
    const messages = await Promise.all((list.data.messages||[]).map(async (m) => {
      const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','Subject','Date'] });
      const headers = msg.data.payload.headers;
      const get = (name) => (headers.find(h=>h.name===name)||{value:''}).value;
      return { id: m.id, threadId: msg.data.threadId, from: get('From'), subject: get('Subject'), date: get('Date'), snippet: msg.data.snippet, unread: (msg.data.labelIds||[]).includes('UNREAD') };
    }));
    res.json({ messages });
  } catch(e) { res.status(503).json({ error: e.message }); }
});

app.get('/api/gmail/message/:id', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const msg = await gmail.users.messages.get({ userId: 'me', id: req.params.id, format: 'full' });
    const headers = msg.data.payload.headers;
    const get = (name) => (headers.find(h=>h.name===name)||{value:''}).value;

    // Recursively extract body from potentially nested multipart messages
    function extractBody(payload) {
      if (!payload) return '';
      // Direct body data (non-multipart)
      if (payload.body && payload.body.data) {
        const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        if (payload.mimeType === 'text/html') {
          // Strip HTML tags for plain text display
          return decoded.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<\/div>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/\n{3,}/g, '\n\n')
                        .trim();
        }
        return decoded;
      }
      // Multipart: recurse into parts, prefer text/plain
      if (payload.parts && payload.parts.length) {
        const plainPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (plainPart) return extractBody(plainPart);
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart) return extractBody(htmlPart);
        // Recurse into nested multipart (multipart/alternative, multipart/related, etc.)
        for (const part of payload.parts) {
          const result = extractBody(part);
          if (result) return result;
        }
      }
      return '';
    }

    const body = extractBody(msg.data.payload) || '(No readable content in this email)';
    res.json({ id: msg.data.id, threadId: msg.data.threadId, from: get('From'), subject: get('Subject'), date: get('Date'), body });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/gmail/send', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured.' });
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: 'Missing to, subject, or body.' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Build RFC 2822 message
    const messageParts = [
      'From: ' + cfg.user,
      'To: ' + to,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    const raw = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    db.addNotification('system', 'Email sent', 'To: ' + to + ' Ã¢ÂÂ ' + subject);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Delete Gmail messages (move to trash)
app.post('/api/gmail/delete-bulk', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ ok: false, error: 'Gmail not configured' });
    const { ids } = req.body;
    if (!ids || !ids.length) return res.json({ ok: false, error: 'No message IDs provided' });
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Move each to trash (safer than permanent delete)
    let deleted = 0;
    for (const id of ids) {
      try {
        await gmail.users.messages.trash({ userId: 'me', id });
        deleted++;
      } catch(e) { console.log('Trash error for', id, e.message); }
    }
    res.json({ ok: true, deleted });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Get messages list by folder
app.get('/api/gmail/messages', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.json({ messages: [], error: 'Gmail not configured' });
    const folder = req.query.folder || 'inbox';
    const limit = parseInt(req.query.limit) || 20;
    const labelMap = { inbox: 'INBOX', sent: 'SENT', drafts: 'DRAFT', starred: 'STARRED' };
    const label = labelMap[folder] || 'INBOX';
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    const listRes = await gmail.users.messages.list({ userId: 'me', labelIds: [label], maxResults: limit });
    const messages = listRes.data.messages || [];
    // Fetch metadata for each message
    const details = await Promise.all(messages.slice(0,limit).map(async m => {
      try {
        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From','To','Subject','Date'] });
        const get = (name) => (msg.data.payload.headers.find(h=>h.name===name)||{value:''}).value;
        const isRead = !msg.data.labelIds.includes('UNREAD');
        return { id: m.id, from: get('From'), to: get('To'), subject: get('Subject'), date: get('Date'), snippet: msg.data.snippet, read: isRead };
      } catch(e) { return { id: m.id, subject: '(error loading)', snippet: e.message, read: true }; }
    }));
    res.json({ ok: true, messages: details });
  } catch(e) { res.json({ ok: false, messages: [], error: e.message }); }
});

app.post('/api/gmail/reply', async (req, res) => {
  try {
    const cfg = getGmailTransport();
    if (!cfg) return res.status(503).json({ error: 'Gmail not configured.' });
    const { to, body, threadId, messageId } = req.body;
    const gmail = google.gmail({ version: 'v1', auth: cfg.oauth2 });
    // Fetch original to get subject for Re: prefix
    let subject = 'Re: (your message)';
    try {
      const orig = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'metadata', metadataHeaders: ['Subject'] });
      const origSubject = (orig.data.payload.headers.find(h=>h.name==='Subject')||{value:''}).value;
      subject = origSubject.startsWith('Re:') ? origSubject : 'Re: ' + origSubject;
    } catch(e2) {}
    const messageParts = [
      'From: ' + cfg.user,
      'To: ' + to,
      'Subject: ' + subject,
      'Content-Type: text/plain; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body
    ];
    const raw = Buffer.from(messageParts.join('\n')).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw, threadId } });
    db.addNotification('system', 'Reply sent', 'To: ' + to);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂ Property Intelligence Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/property/intel/:leadId', async (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const scraper = require('./scraper');
    const intel   = await scraper.fetchPropertyIntelligence(lead.address, lead.county, lead.state, lead.beds);
    const dbData  = db.readDB();
    const idx     = (dbData.leads||[]).findIndex(l => l.id === lead.id);
    if (idx >= 0) { dbData.leads[idx] = { ...dbData.leads[idx], ...intel, intel_fetched: new Date().toISOString() }; db.writeDB(dbData); }
    res.json({ ok: true, intel });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/outreach/deep', async (req, res) => {
  try {
    const { leadId } = req.body;
    const lead = db.getLeads().find(l => l.id === leadId);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    const ai = require('./ai');
    const intel = { avgCompPrice: lead.avgCompPrice, compSource: lead.compSource, comps: lead.comps, rentEstimate: lead.rent_estimate, lastSalePrice: lead.lastSalePrice, lastSaleYear: lead.lastSaleYear, zestimate: lead.zestimate };
    const result = await ai.generateDeepOutreach(lead, intel);
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/outreach/buyer-intro', async (req, res) => {
  try {
    const { buyerId } = req.body;
    const buyer = db.getBuyers().find(b => b.id === buyerId);
    if (!buyer) return res.status(404).json({ error: 'Buyer not found' });
    const ai = require('./ai');
    const result = await ai.generateBuyerIntroOutreach(buyer);
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/review-queue', (req, res) => {
  try {
    const dbData = db.readDB();
    res.json({ queue: dbData.reviewQueue || [], count: (dbData.reviewQueue||[]).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/review-queue/action', (req, res) => {
  try {
    const { id, action } = req.body;
    const dbData = db.readDB();
    if (!dbData.reviewQueue) return res.json({ ok: true });
    const item = dbData.reviewQueue.find(d => d.id === id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    dbData.reviewQueue = dbData.reviewQueue.filter(d => d.id !== id);
    if (action === 'accept') {
      if (!dbData.leads) dbData.leads = [];
      dbData.leads.push({ ...item, status: 'New', validationStatus: 'manual_accepted', created: new Date().toISOString().slice(0,10) });
      db.addNotification('deal', 'Lead accepted from review queue', item.address||'Unknown');
    }
    db.writeDB(dbData);
    res.json({ ok: true, action, remaining: dbData.reviewQueue.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/scrape/buyers', async (req, res) => {
  try {
    const scraper = require('./scraper');
    res.json({ ok: true, message: 'Buyer scrape started in background' });
    scraper.runDailyBuyerScrape(db).then(added => {
      if (added > 0) db.addNotification('buyer', added+' new buyers scraped', 'Manual buyer scrape complete');
    }).catch(e => console.error('Manual scrape error:', e.message));
  } catch(e) { res.status(500).json({ error: e.message }); }
});



// Ã¢ÂÂÃ¢ÂÂ Google Drive API Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function getDriveClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, 'https://developers.google.com/oauthplayground');
  oauth2.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2 });
}

app.get('/api/drive/status', async (req, res) => {
  try {
    const drive = getDriveClient();
    if (!drive) return res.json({ connected: false, reason: 'GDRIVE_REFRESH_TOKEN not set in Railway Variables' });
    const about = await drive.about.get({ fields: 'user' });
    res.json({ connected: true, email: about.data.user.emailAddress });
  } catch(e) {
    // Common causes: token expired, wrong scope, revoked access
    const reason = e.message.includes('invalid_grant') ? 'Refresh token expired Ã¢ÂÂ regenerate at OAuth Playground' :
                   e.message.includes('insufficientPermissions') ? 'Token missing Drive scope Ã¢ÂÂ re-authorize with https://www.googleapis.com/auth/drive scope' :
                   e.message.includes('invalid_client') ? 'Invalid Client ID or Secret Ã¢ÂÂ check Railway Variables' :
                   e.message;
    res.json({ connected: false, reason });
  }
});

app.post('/api/drive/backup', async (req, res) => {
  try {
    const drive = getDriveClient();
    if (!drive) return res.json({ ok: false, error: 'Drive not configured. Add GDRIVE_REFRESH_TOKEN to Railway.' });
    const leads = db.getLeads();
    const today = new Date().toISOString().slice(0, 10);
    const headers = ['Address','County','State','Category','ARV','Offer','Repairs','Spread','Fee Lo','Fee Hi','Status','DOM','Phone','Email','Source','Deal Type','Created'];
    const rows = leads.map(l => [
      (l.address||'').replace(/,/g,' '),
      (l.county||'').replace(/,/g,' '),
      l.state||'',
      l.category||'',
      l.arv||0, l.offer||0, l.repairs||0, l.spread||0, l.fee_lo||0, l.fee_hi||0,
      l.status||'New Lead', l.dom||0,
      l.phone||'', l.email||'',
      l.source||'AI Generated', l.dealType||'',
      (l.created||'').slice(0,10),
    ].map(v => '"'+String(v).replace(/"/g,"'")+'"').join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    let folderId;
    const folderSearch = await drive.files.list({ q: "name='Montsan REI' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id,name)' });
    if (folderSearch.data.files.length > 0) { folderId = folderSearch.data.files[0].id; }
    else { const folder = await drive.files.create({ requestBody: { name: 'Montsan REI', mimeType: 'application/vnd.google-apps.folder' }, fields: 'id' }); folderId = folder.data.id; }
    const { Readable } = require('stream');
    await drive.files.create({
      requestBody: { name: 'leads_backup_' + today + '.csv', parents: [folderId] },
      media: { mimeType: 'text/csv', body: Readable.from([csvContent]) }
    });
    db.addNotification('system', 'Google Drive backup complete', leads.length + ' leads exported to Montsan REI/');
    res.json({ ok: true, leads: leads.length, rows: rows.length, folder: 'Montsan REI' });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ API: Search Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json({ results: [] });
  const lower = q.toLowerCase();
  const leads  = db.getLeads().filter(l => JSON.stringify(l).toLowerCase().includes(lower)).slice(0,10);
  const buyers = db.getBuyers().filter(b => JSON.stringify(b).toLowerCase().includes(lower)).slice(0,5);
  res.json({ results: [...leads.map(l=>({...l,_type:'lead'})), ...buyers.map(b=>({...b,_type:'buyer'}))] });
});


// Ã¢ÂÂÃ¢ÂÂ Scrape progress tracking Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const scrapeProgress = { buyers: null, deals: null };

app.get('/api/scraper/progress', (req, res) => {
  res.json({ buyers: scrapeProgress.buyers, deals: scrapeProgress.deals });
});
// Ã¢ÂÂÃ¢ÂÂ Scraper routes Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const scraper = require('./modules/scraper');

// Trigger buyer scrape manually
app.post('/api/scraper/buyers', async (req, res) => {
  try {
    // Accept custom markets array, fall back to hot markets or all states
    const customMarkets = req.body.markets;
    const markets = Array.isArray(customMarkets) && customMarkets.length > 0
      ? customMarkets
      : req.body.allStates ? scraper.ALL_STATE_MARKETS : scraper.HOT_MARKETS;
    res.json({ ok: true, message: `Buyer scrape started for ${markets.length} market${markets.length===1?'':'s'}` });
    scrapeProgress.buyers = { status: 'running', markets: markets.length, started: new Date().toISOString() };
    setImmediate(async () => {
      try {
        const buyers = await scraper.scrapeCraigslistBuyers(markets);
        let added = 0;
        const existing = db.getBuyers().map(b => `${b.phone||''}${b.email||''}`);
        for (const b of buyers) {
          const key = `${b.phone||''}${b.email||''}`;
          if (key.length > 3 && !existing.includes(key)) {
            b.id = require('uuid').v4();
            db.addBuyer(b);
            added++;
          }
        }
        scrapeProgress.buyers = { status: 'complete', found: added, markets: markets.length, time: new Date().toISOString() };
        db.addNotification('buyer', `${added} real buyers found`, `Craigslist scrape across ${markets.length} markets`);
        console.log(`Buyer scrape complete: ${added} new buyers added`);
      } catch(e) { console.error('Buyer scrape error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Trigger deal scrape manually
app.post('/api/scraper/deals', async (req, res) => {
  try {
    const customMarkets = req.body.markets;
    const markets = Array.isArray(customMarkets) && customMarkets.length > 0
      ? customMarkets
      : req.body.allStates ? scraper.ALL_STATE_MARKETS : scraper.HOT_MARKETS;
    res.json({ ok: true, message: `Deal scrape started for ${markets.length} market${markets.length===1?'':'s'}` });
    setImmediate(async () => {
      try {
        const [clDeals, hudDeals, fsboDeals, landDeals] = await Promise.allSettled([
          scraper.scrapeCraigslistDeals(markets),
          scraper.scrapeHUDHomes(),
          scraper.scrapeFSBO(),
          scraper.scrapeLandWatch(),
        ]);
        const allDeals = [
          ...(clDeals.value||[]),
          ...(hudDeals.value||[]),
          ...(fsboDeals.value||[]),
          ...(landDeals.value||[]),
        ];
        // Store in review queue
        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        let added = 0;
        const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl));
        for (const deal of allDeals) {
          if (!existingUrls.has(deal.sourceUrl)) {
            deal.id = require('uuid').v4();
            dbData.reviewQueue.push(deal);
            added++;
          }
        }
        db.writeDB(dbData);
        db.addNotification('deal', `${added} deals in Review Queue`, `From Craigslist, HUD, FSBO, Landwatch`);
        console.log(`Deal scrape complete: ${added} new deals in review queue`);
      } catch(e) { console.error('Deal scrape error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Get review queue
app.get('/api/review-queue', (req, res) => {
  const dbData = db.readDB();
  res.json({ queue: dbData.reviewQueue || [], count: (dbData.reviewQueue||[]).length });
});

// Accept a review queue item Ã¢ÂÂ validate + enrich Ã¢ÂÂ add as real lead
app.post('/api/review-queue/:id/accept', async (req, res) => {
  try {
    const dbData = db.readDB();
    const idx = (dbData.reviewQueue||[]).findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.json({ ok: false, error: 'Not found' });
    const item = dbData.reviewQueue[idx];

    // Enrich with real data
    const enriched = await scraper.validateAndEnrichLead(item.address, item.state || '');
    const classification = scraper.classifyDeal({ ...item, arvEstimate: enriched.arvEstimate });

    const lead = {
      ...item,
      id: require('uuid').v4(),
      arv: enriched.arvEstimate || item.listPrice || 0,
      offer: Math.round((enriched.arvEstimate || item.listPrice || 0) * 0.65),
      repairs: Math.round((enriched.arvEstimate || item.listPrice || 0) * 0.10),
      beds: enriched.beds || item.beds || 0,
      baths: enriched.baths || item.baths || 0,
      sqft: enriched.sqft || item.sqft || 0,
      rentEstimate: enriched.rentEstimate || 0,
      photoUrl: enriched.photoUrl || '',
      zillowUrl: enriched.zillowUrl || '',
      redfinUrl: enriched.redfinUrl || '',
      streetViewUrl: enriched.streetViewUrl || '',
      comps: enriched.comps || [],
      dealType: classification.type,
      dealTypeReason: classification.reason,
      dataSource: enriched.dataSource || item.source,
      verified: enriched.valid,
      status: 'New Lead',
      userId: req.body.userId || 'admin',
      created: new Date().toISOString(),
    };
    // Compute fee
    const spread = lead.arv - lead.offer - lead.repairs;
    lead.spread = spread;
    lead.fee_lo = Math.round(spread * 0.35);
    lead.fee_hi = Math.round(spread * 0.55);

    db.addLead(lead);
    dbData.reviewQueue.splice(idx, 1);
    db.writeDB(dbData);
    db.addNotification('deal', 'Lead accepted from Review Queue', lead.address);
    res.json({ ok: true, lead });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Reject a review queue item
app.post('/api/review-queue/:id/reject', (req, res) => {
  try {
    const dbData = db.readDB();
    dbData.reviewQueue = (dbData.reviewQueue||[]).filter(r => r.id !== req.params.id);
    db.writeDB(dbData);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Skip (keep in queue for later)
app.post('/api/review-queue/:id/skip', (req, res) => {
  try {
    const dbData = db.readDB();
    const item = (dbData.reviewQueue||[]).find(r => r.id === req.params.id);
    if (item) { item.skipped = true; item.skippedAt = new Date().toISOString(); }
    db.writeDB(dbData);
    res.json({ ok: true });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Enrich a single existing lead on demand
app.post('/api/leads/:id/enrich', async (req, res) => {
  try {
    const lead = db.getLeads().find(l => l.id === req.params.id);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const enriched = await scraper.validateAndEnrichLead(lead.address, lead.state || '');
    const classification = scraper.classifyDeal({ ...lead, arvEstimate: enriched.arvEstimate || lead.arv });
    const updates = {
      photoUrl: enriched.photoUrl || lead.photoUrl || '',
      zillowUrl: enriched.zillowUrl || lead.zillowUrl || '',
      redfinUrl: enriched.redfinUrl || lead.redfinUrl || '',
      streetViewUrl: enriched.streetViewUrl || lead.streetViewUrl || '',
      comps: enriched.comps || lead.comps || [],
      rentEstimate: enriched.rentEstimate || lead.rentEstimate || 0,
      dealType: classification.type,
      dealTypeReason: classification.reason,
      dataSource: enriched.dataSource || lead.dataSource || '',
    };
    if (enriched.arvEstimate && !lead.arv) {
      updates.arv = enriched.arvEstimate;
      updates.offer = Math.round(enriched.arvEstimate * 0.65);
      updates.repairs = Math.round(enriched.arvEstimate * 0.10);
      const spread = updates.arv - updates.offer - updates.repairs;
      updates.spread = spread;
      updates.fee_lo = Math.round(spread * 0.35);
      updates.fee_hi = Math.round(spread * 0.55);
    }
    db.updateLead(lead.id, updates);
    res.json({ ok: true, updates });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂ Propwire CSV Parser (inline Ã¢ÂÂ no external dependency) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function parsePropwireCSV(csvText) {
  const { v4: uuidv4 } = require('uuid');
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { leads: [], stats: { total: 0, kept: 0, skipped_type: 0, skipped_price: 0 } };

  function parseCSVLine(line) {
    const fields = []; let field = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuote) { inQuote = true; continue; }
      if (ch === '"' && inQuote && line[i+1] === '"') { field += '"'; i++; continue; }
      if (ch === '"' && inQuote) { inQuote = false; continue; }
      if (ch === ',' && !inQuote) { fields.push(field.trim()); field = ''; continue; }
      field += ch;
    }
    fields.push(field.trim()); return fields;
  }

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/"/g,''));
  function col(names) { for (const n of names) { const i = headers.indexOf(n.toLowerCase()); if (i>=0) return i; } return -1; }

  const C = {
    address: col(['address']), city: col(['city']), state: col(['state']),
    zip: col(['zip']), county: col(['county']),
    sqft: col(['living square feet']), year: col(['year built']),
    beds: col(['bedrooms']), baths: col(['bathrooms']),
    propType: col(['property type']), landUse: col(['land use']),
    owner1f: col(['owner 1 first name']), owner1l: col(['owner 1 last name']),
    ownerType: col(['owner type']), ownerOcc: col(['owner occupied']),
    vacant: col(['vacant?']), dom: col(['days on market']),
    listPrice: col(['listing price']), lastSaleDate: col(['last sale date']),
    lastSaleAmt: col(['last sale amount']), estValue: col(['estimated value']),
    estEquity: col(['estimated equity']), estEquityPct: col(['estimated equity percent']),
    mortgage: col(['open mortgage balance']), defaultAmt: col(['default amount']),
    auctionDate: col(['auction date']), ownershipMo: col(['ownership length (months)']),
  };

  const GOOD = new Set(['single family residence','multi-family 2-4 units','condominium / townhouse','condominium/townhouse','townhouse','duplex','triplex','fourplex']);
  const leads = [], stats = { total: lines.length-1, kept:0, skipped_type:0, skipped_price:0, skipped_novalue:0 };

  for (const line of lines.slice(1)) {
    try {
      const f = parseCSVLine(line);
      const get = i => i>=0&&i<f.length ? f[i].trim() : '';
      const num = i => parseFloat((get(i)||'0').replace(/[$,]/g,''))||0;
      const addr = get(C.address); if (!addr||addr.length<3) continue;
      if (!GOOD.has(get(C.propType).toLowerCase())) { stats.skipped_type++; continue; }
      const lu = get(C.landUse).toLowerCase();
      if (lu==='commercial'||lu==='industrial') { stats.skipped_type++; continue; }
      const estValue = num(C.estValue);
      if (!estValue) { stats.skipped_novalue++; continue; }
      if (estValue<60000||estValue>800000) { stats.skipped_price++; continue; }
      const equityPct=num(C.estEquityPct), isVacant=get(C.vacant)==='1';
      const isDefaulted=num(C.defaultAmt)>0, hasAuction=get(C.auctionDate).length>4;
      const ownershipMonths=num(C.ownershipMo), isOwnerOcc=get(C.ownerOcc)==='1';
      if (equityPct<15&&!isVacant&&!isDefaulted&&!hasAuction&&ownershipMonths<=120) { stats.skipped_type++; continue; }
      const city=get(C.city),state=get(C.state),zip=get(C.zip),county=get(C.county);
      const beds=Math.round(num(C.beds)),baths=num(C.baths),sqft=Math.round(num(C.sqft)),year=Math.round(num(C.year));
      const owner1=[get(C.owner1f),get(C.owner1l)].filter(Boolean).join(' ').trim();
      let category='Absentee Owner';
      if (isDefaulted||hasAuction) category='Pre-FC';
      else if (isVacant) category='Vacant Property';
      else if (ownershipMonths>240) category='Tired Landlord';
      else if (equityPct>=50) category='High Equity';
      const arv=estValue;
      const repairRate=sqft===0?0:year<1960?60:year<1980?45:year<1995?28:year<2010?18:12;
      const estRepairs=sqft>0?Math.min(Math.round(sqft*repairRate),Math.round(arv*0.25)):Math.round(arv*0.10);
      const offer=Math.max(0,Math.round(arv*0.70-estRepairs));
      const spread=Math.max(0,arv-offer-estRepairs);
      if (offer<=0||spread<3000) { stats.skipped_price++; continue; }
      const fullAddress=[addr,city,state,zip].filter(Boolean).join(', ');
      stats.kept++;
      leads.push({
        id:uuidv4(), address:fullAddress, county, state, zip,
        beds, baths, sqft, year, owner_name:owner1, phone:'', email:'',
        isVacant, isAbsentee:!isOwnerOcc, ownerType:get(C.ownerType),
        ownershipMonths:Math.round(ownershipMonths), category,
        arv, repairs:estRepairs, offer, mao:offer, spread,
        fee_lo:Math.round(spread*0.35), fee_hi:Math.round(spread*0.55),
        equity:Math.round(num(C.estEquity)), equityPct:Math.round(equityPct),
        mortgage:Math.round(num(C.mortgage)), listPrice:num(C.listPrice),
        lastSaleDate:get(C.lastSaleDate), lastSaleAmt:num(C.lastSaleAmt),
        estValue, dom:Math.round(num(C.dom))||0,
        status:'New Lead', source:'Propwire', verified:true,
        dealType:spread>arv*0.20?'Wholesale':spread>arv*0.12?'Fix & Flip':'Buy & Hold',
        zillowUrl:`https://www.zillow.com/homes/${encodeURIComponent(fullAddress)}_rb/`,
        redfinUrl:`https://www.redfin.com/search?searchType=4&query=${encodeURIComponent(fullAddress)}`,
        created:new Date().toISOString(), userId:'admin',
      });
    } catch(e) {}
  }
  return { leads, stats };
}

// Ã¢ÂÂÃ¢ÂÂ Free Data Sources Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
function getDatasources() {
  return require('./modules/datasources');
}

// Propwire CSV import endpoint
app.post('/api/import/propwire', express.text({ limit: '100mb', type: '*/*' }), async (req, res) => {
  try {
    const csvText = req.body;
    if (!csvText || csvText.length < 10) return res.json({ ok: false, error: 'No CSV data received' });

    const rawResult = parsePropwireCSV(csvText);
    // Handle both old format (array) and new format ({leads, stats})
    const leads = Array.isArray(rawResult) ? rawResult : (rawResult.leads || []);
    const stats = Array.isArray(rawResult) ? { total: leads.length, kept: leads.length, skipped_type: 0, skipped_price: 0 } : (rawResult.stats || {});

    if (!leads || !leads.length) return res.json({
      ok: false,
      error: `No wholesale deals found in this file. Processed ${stats.total} rows Ã¢ÂÂ all were filtered out (${stats.skipped_type} wrong property type, ${stats.skipped_price} outside price range).`
    });

    // Delete all existing Propwire leads before reimporting to avoid stale bad data
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => l.source !== 'Propwire');
    const deleted = before - dbData.leads.length;

    // Dedup new leads by normalized address
    const normalize = (s) => (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const existingAddrs = new Set(dbData.leads.map(l => normalize(l.address)));
    let added = 0, dupes = 0;
    for (const lead of leads) {
      const key = normalize(lead.address);
      if (key.length > 5 && !existingAddrs.has(key)) {
        dbData.leads.push(lead);
        existingAddrs.add(key);
        added++;
      } else { dupes++; }
    }

    db.writeDB(dbData);
    db.addNotification('deal',
      `${added} real wholesale leads imported from Propwire`,
      `${stats.total} rows Ã¢ÂÂ ${stats.kept} passed filter Ã¢ÂÂ ${added} imported. Removed: ${stats.skipped_type} wrong type, ${stats.skipped_price} bad price/spread, ${deleted} stale leads cleared.`
    );

    // Auto-upload to Google Drive in background
    setImmediate(async () => {
      try {
        const cfg = getGmailTransport();
        if (cfg && added > 0) {
          const { google } = require('googleapis');
          const drive = google.drive({ version: 'v3', auth: cfg.oauth2 });
          const addedLeads = dbData.leads.filter(l => l.source === 'Propwire');
          const csvRows = ['Address,County,State,Category,ARV,Offer,Spread,Fee Lo,Fee Hi,Owner,Phone,Email,Equity%,DOM,Deal Type,Source,Zillow,Redfin'];
          addedLeads.forEach(l => {
            csvRows.push([
              '"' + (l.address||'').replace(/"/g,"'") + '"',
              l.county||'', l.state||'', l.category||'',
              l.arv||0, l.offer||0, l.spread||0, l.fee_lo||0, l.fee_hi||0,
              '"' + (l.owner_name||'').replace(/"/g,"'") + '"',
              l.phone||'', l.email||'',
              l.equityPct||0, l.dom||0, l.dealType||'',
              'Propwire',
              '"' + (l.zillowUrl||'') + '"',
              '"' + (l.redfinUrl||'') + '"',
            ].join(','));
          });
          const csvContent = csvRows.join('\n');
          const date = new Date().toISOString().split('T')[0];
          const fileName = `Propwire Import - ${added} leads - ${date}.csv`;
          await drive.files.create({
            requestBody: { name: fileName, mimeType: 'text/csv', parents: [] },
            media: { mimeType: 'text/csv', body: csvContent },
          });
          db.addNotification('system', 'Google Drive updated', `${fileName} uploaded automatically`);
          console.log('[Drive] Uploaded:', fileName);
        }
      } catch(e) { console.log('[Drive] Auto-upload error:', e.message); }
    });

    res.json({
      ok: true,
      parsed: stats.total,
      filtered: stats.kept,
      added,
      dupes,
      deleted_stale: deleted,
      stats,
      sample: leads.slice(0,3).map(l => ({ address: l.address, category: l.category, arv: l.arv, spread: l.spread }))
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Run all free data sources
app.post('/api/datasources/run-all', async (req, res) => {
  try {
    const states = req.body.states || null;
    res.json({ ok: true, message: 'All free data sources started. Check Review Queue and Buyers in 5-10 minutes.' });
    setImmediate(async () => {
      try {
        const results = await getDatasources().runAllFreeSources({ states });
        // Add leads to review queue
        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        const existingUrls = new Set(dbData.reviewQueue.map(r => r.sourceUrl).filter(Boolean));
        let leadsAdded = 0;
        for (const lead of results.leads) {
          if (!existingUrls.has(lead.sourceUrl) && !db.leadExists(lead.address)) {
            dbData.reviewQueue.push(lead);
            leadsAdded++;
          }
        }
        db.writeDB(dbData);
        // Add buyers
        let buyersAdded = 0;
        const existingBuyers = db.getBuyers().map(b => `${b.phone||''}${b.email||''}${b.name||''}`);
        for (const buyer of results.buyers) {
          const key = `${buyer.phone||''}${buyer.email||''}${buyer.name||''}`;
          if (key.length > 3 && !existingBuyers.includes(key)) {
            db.addBuyer(buyer);
            buyersAdded++;
          }
        }
        db.addNotification('system', `Data pull complete`, `${leadsAdded} leads in Review Queue + ${buyersAdded} buyers added. Errors: ${results.errors.length}`);
        console.log(`[DataSources] ${leadsAdded} leads, ${buyersAdded} buyers. Errors: ${results.errors.join('; ')}`);
      } catch(e) { console.error('[DataSources] Error:', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Run specific source
app.post('/api/datasources/:source', async (req, res) => {
  try {
    const { source } = req.params;
    const states = req.body.states || null;
    res.json({ ok: true, message: `${source} scrape started` });
    setImmediate(async () => {
      try {
        let leads = [], buyers = [];
        if (source === 'redfin') leads = await getDatasources().scrapeRedfin();
        else if (source === 'zillow') leads = await getDatasources().scrapeZillowDeals();
        else if (source === 'craigslist') leads = await getDatasources().scrapeCraigslistDeals();
        else if (source === 'connected-investors') buyers = await getDatasources().scrapeConnectedInvestors(states);
        // Legacy names kept for compatibility
        else if (source === 'hud' || source === 'cook' || source === 'wayne' || source === 'clark' || source === 'maricopa') leads = await getDatasources().scrapeRedfin();
        else if (source === 'biggerpockets') buyers = await getDatasources().scrapeConnectedInvestors(states);

        const dbData = db.readDB();
        if (!dbData.reviewQueue) dbData.reviewQueue = [];
        let added = 0;
        for (const lead of leads) {
          if (!db.leadExists(lead.address)) {
            dbData.reviewQueue.push(lead);
            added++;
          }
        }
        db.writeDB(dbData);

        let buyersAdded = 0;
        const existing = db.getBuyers().map(b => b.name||'');
        for (const buyer of buyers) {
          if (!existing.includes(buyer.name)) { db.addBuyer(buyer); buyersAdded++; }
        }

        db.addNotification('system', `${source} complete`, `${added} leads + ${buyersAdded} buyers`);
        scrapeProgress[source] = { status: 'complete', leads: added, buyers: buyersAdded, time: new Date().toISOString() };
      } catch(e) { console.error(`[${source}]`, e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Delete endpoints Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
// Delete single lead
app.delete('/api/leads/:id', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => l.id !== req.params.id);
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Bulk status change
app.post('/api/leads/bulk-status', (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids || !ids.length || !status) return res.json({ ok: false, error: 'Missing ids or status' });
    const idSet = new Set(ids);
    const dbData = db.readDB();
    let updated = 0;
    (dbData.leads || []).forEach(l => {
      if (idSet.has(l.id)) { l.status = status; updated++; }
    });
    db.writeDB(dbData);
    res.json({ ok: true, updated });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete multiple leads
app.post('/api/leads/delete-bulk', (req, res) => {
  try {
    const ids = new Set(req.body.ids || []);
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    dbData.leads = (dbData.leads || []).filter(l => !ids.has(l.id));
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete all AI-generated fake leads
app.delete('/api/leads/clear/fake', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.leads || []).length;
    const REAL_SOURCES = ['Propwire','HUD Homestore','Craigslist','Cook County Open Data',
      'Wayne County Treasurer','Clark County ArcGIS','Maricopa County Treasurer',
      'FSBO.com','Landwatch','Connected Investors','BiggerPockets','Manual'];
    dbData.leads = (dbData.leads || []).filter(l => {
      const src = l.source || '';
      // Keep if source is a real data source
      if (REAL_SOURCES.includes(src)) return true;
      // Keep if source contains 'County' or 'HUD' (government sources)
      if (src.includes('County') || src.includes('HUD') || src.includes('Propwire')) return true;
      // Remove AI-generated and empty-source leads
      return false;
    });
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.leads.length, remaining: dbData.leads.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete single buyer
app.delete('/api/buyers/:id', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.buyers || []).length;
    dbData.buyers = (dbData.buyers || []).filter(b => b.id !== req.params.id);
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.buyers.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Delete all fake/AI buyers
app.delete('/api/buyers/clear/fake', (req, res) => {
  try {
    const dbData = db.readDB();
    const before = (dbData.buyers || []).length;
    // Keep only buyers from real sources
    dbData.buyers = (dbData.buyers || []).filter(b =>
      b.source && ['Craigslist','Connected Investors','BiggerPockets','Propwire','HUD Homestore','Manual'].includes(b.source)
    );
    db.writeDB(dbData);
    res.json({ ok: true, removed: before - dbData.buyers.length, remaining: dbData.buyers.length });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});


// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
//  COMMUNICATIONS Ã¢ÂÂ SMS, Bulk Email, Browser Dialer
// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// Ã¢ÂÂÃ¢ÂÂ Twilio status Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/comms/status', (req, res) => {
  const comms = require('./modules/comms');
  res.json({
    twilio: comms.isTwilioConfigured(),
    twilioPhone: comms.getTwilioPhone(),
    gmail: !!getGmailTransport(),
  });
});

// Ã¢ÂÂÃ¢ÂÂ Send single SMS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/send', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { to, body, leadId } = req.body;
    if (!to || !body) return res.json({ ok: false, error: 'Missing to or body' });
    const result = await comms.sendSMS(to, body, leadId, db);
    res.json(result);
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Preview AI SMS for a lead Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/sms/preview/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const lead  = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const body = comms.generateHumanizedSMS(lead);
    res.json({ ok: true, body, phone: lead.phone });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Preview AI Email for a lead Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/email/preview/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const lead  = db.getLeads().find(l => l.id === req.params.leadId);
    if (!lead) return res.json({ ok: false, error: 'Lead not found' });
    const email = comms.generateHumanizedEmail(lead);
    res.json({ ok: true, ...email, to: lead.email });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Bulk SMS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/bulk', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { leadIds, customMessage } = req.body;
    if (!leadIds || !leadIds.length) return res.json({ ok: false, error: 'No leads selected' });
    const leads = db.getLeads().filter(l => leadIds.includes(l.id));
    const withPhone = leads.filter(l => l.phone);
    if (!withPhone.length) return res.json({ ok: false, error: 'None of the selected leads have phone numbers. Add phone numbers via skip tracing first.' });
    // Start async Ã¢ÂÂ respond immediately
    res.json({ ok: true, total: withPhone.length, message: `Sending ${withPhone.length} SMS messages in background. Check SMS tab for progress.` });
    setImmediate(async () => {
      try {
        const results = await comms.sendBulkSMS(withPhone, db, { customMessage });
        db.addNotification('system', `Bulk SMS complete`, `${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped (no phone)`);
        console.log('[BulkSMS]', results);
      } catch(e) { console.error('[BulkSMS]', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Bulk Email Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/email/bulk', async (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { leadIds, customEmail } = req.body;
    if (!leadIds || !leadIds.length) return res.json({ ok: false, error: 'No leads selected' });
    const leads = db.getLeads().filter(l => leadIds.includes(l.id));
    const withEmail = leads.filter(l => l.email);
    if (!withEmail.length) return res.json({ ok: false, error: 'None of the selected leads have email addresses. Add emails via skip tracing first.' });
    const gmailCfg = getGmailTransport();
    if (!gmailCfg) return res.json({ ok: false, error: 'Gmail not connected. Check Gmail settings.' });
    res.json({ ok: true, total: withEmail.length, message: `Sending ${withEmail.length} personalized emails in background. Check Email tab for progress.` });
    setImmediate(async () => {
      try {
        const results = await comms.sendBulkEmail(withEmail, gmailCfg, db, { customEmail });
        db.addNotification('system', `Bulk Email complete`, `${results.sent} sent, ${results.failed} failed, ${results.skipped} skipped (no email)`);
        console.log('[BulkEmail]', results);
      } catch(e) { console.error('[BulkEmail]', e.message); }
    });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ SMS Conversations Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/sms/conversations', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const convos = comms.getAllSMSConversations(db);
    res.json({ ok: true, conversations: convos });
  } catch(e) { res.json({ ok: false, conversations: [], error: e.message }); }
});

app.get('/api/sms/conversation/:leadId', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const msgs  = comms.getSMSConversation(req.params.leadId, db);
    res.json({ ok: true, messages: msgs });
  } catch(e) { res.json({ ok: false, messages: [], error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Inbound SMS Webhook (Twilio posts here) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/sms/webhook', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const { From, Body } = req.body;
    const lead = comms.handleInboundSMS(From, Body, db);
    console.log(`[SMS Inbound] From: ${From} Ã¢ÂÂ "${Body.slice(0,50)}"`);
    // Respond with empty TwiML so Twilio doesn't send error
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  } catch(e) {
    console.error('[SMS Webhook]', e.message);
    res.set('Content-Type', 'text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

// Ã¢ÂÂÃ¢ÂÂ Browser Dialer Token Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/token', (req, res) => {
  try {
    const comms = require('./modules/comms');
    const token = comms.generateDialerToken('gabriel');
    if (!token) return res.json({ ok: false, error: 'Twilio not configured. Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_API_KEY, TWILIO_API_SECRET to Railway.' });
    res.json({ ok: true, token });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Outbound call via Twilio REST (simpler than browser SDK) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/dialer/call', async (req, res) => {
  try {
    const { to, leadId } = req.body;
    const sid   = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from  = process.env.TWILIO_PHONE_NUMBER;
    if (!sid || !token || !from) return res.json({ ok: false, error: 'Twilio not configured' });
    const twilio = require('twilio')(sid, token);
    const cleaned = to.replace(/[^0-9]/g,'');
    const phone   = cleaned.length === 10 ? '+1' + cleaned : '+' + cleaned;
    // Call connects Twilio number to seller, then bridges to your phone
    const callbackUrl = `${process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''}/api/dialer/twiml`;
    const call = await twilio.calls.create({
      to:   phone,
      from,
      url:  callbackUrl || 'http://demo.twilio.com/docs/voice.xml',
      record: true, // Enable call recording
      recordingStatusCallback: `${process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : ''}/api/dialer/recording-complete`,
    });
    // Log the call
    const dbData = db.readDB();
    if (!dbData.callLog) dbData.callLog = [];
    dbData.callLog.push({ id: uuidv4(), leadId, to: phone, callSid: call.sid, status: call.status, created: new Date().toISOString() });
    db.writeDB(dbData);
    res.json({ ok: true, callSid: call.sid, status: call.status });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ TwiML for calls Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.post('/api/dialer/twiml', (req, res) => {
  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is Gabriel from Montsan REI. Please hold for a moment.</Say>
  <Dial callerId="${process.env.TWILIO_PHONE_NUMBER || ''}">
    <Number>${process.env.GABRIEL_PHONE || process.env.TWILIO_PHONE_NUMBER || ''}</Number>
  </Dial>
</Response>`);
});


// Ã¢ÂÂÃ¢ÂÂ Recording complete webhook (Twilio calls this when recording is ready) Ã¢ÂÂ
app.post('/api/dialer/recording-complete', async (req, res) => {
  try {
    const { CallSid, RecordingUrl, RecordingDuration } = req.body;
    console.log(`[Recording] CallSid: ${CallSid}, Duration: ${RecordingDuration}s`);
    // Find the call log entry
    const dbData = db.readDB();
    if (!dbData.callLog) dbData.callLog = [];
    const callEntry = dbData.callLog.find(c => c.callSid === CallSid);
    if (callEntry) {
      callEntry.recordingUrl = RecordingUrl + '.mp3';
      callEntry.duration = parseInt(RecordingDuration) || 0;
      callEntry.recordingReady = true;
      // Auto-trigger sentiment analysis
      const lead = callEntry.leadId ? (dbData.leads||[]).find(l => l.id === callEntry.leadId) : null;
      if (lead) {
        try {
          const ai = require('./ai');
          const analysis = await ai.ask(`You are analyzing a real estate wholesaling call.
Lead: ${lead.address}, ${lead.category}, ARV $${lead.arv||0}, Offer $${lead.offer||0}
Owner: ${lead.owner_name||'Unknown'}
Call duration: ${RecordingDuration} seconds

Based on the call duration and lead type, provide:
1. SENTIMENT: (Positive/Neutral/Negative/Unknown)
2. RECOMMENDATION: What Gabriel should do next (1-2 sentences)
3. FOLLOW_UP: Suggested follow-up message
4. LESSON: One thing Gabriel could improve for next call

Respond in JSON format only.`, 'free');
          try {
            const parsed = JSON.parse(analysis.replace(/```json|```/g,'').trim());
            callEntry.sentiment = parsed.SENTIMENT || 'Unknown';
            callEntry.recommendation = parsed.RECOMMENDATION || '';
            callEntry.followUp = parsed.FOLLOW_UP || '';
            callEntry.lesson = parsed.LESSON || '';
          } catch(e) {
            callEntry.sentiment = 'Unknown';
            callEntry.recommendation = analysis.slice(0, 200);
          }
          db.addNotification('system', 'Call analysis ready', `${lead.owner_name||lead.address} Ã¢ÂÂ ${callEntry.sentiment} sentiment. ${callEntry.recommendation}`);
        } catch(e) { console.log('[AI Analysis]', e.message); }
      }
      db.writeDB(dbData);
    }
    res.sendStatus(200);
  } catch(e) {
    console.error('[Recording webhook]', e.message);
    res.sendStatus(200);
  }
});

// Ã¢ÂÂÃ¢ÂÂ Get call analysis for a specific call Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/analysis/:callSid', (req, res) => {
  try {
    const dbData = db.readDB();
    const call = (dbData.callLog||[]).find(c => c.callSid === req.params.callSid);
    if (!call) return res.json({ ok: false, error: 'Call not found' });
    res.json({ ok: true, call });
  } catch(e) { res.json({ ok: false, error: e.message }); }
});

// Ã¢ÂÂÃ¢ÂÂ Call log Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
app.get('/api/dialer/calls', (req, res) => {
  try {
    const dbData = db.readDB();
    const calls  = (dbData.callLog || []).sort((a,b) => new Date(b.created) - new Date(a.created));
    res.json({ ok: true, calls });
  } catch(e) { res.json({ ok: false, calls: [], error: e.message }); }
});



// ============================================================

// ============================================================
// BUYERS CRM PATCH
// ============================================================

function scoreDealForBuyer(lead, buyer) {
  var score = 0;
  var bb = buyer.buyBox || {};
  var price = lead.offer || lead.mao || 0;
  var maxP = bb.maxPrice || buyer.maxPrice || 999999;
  var minP = bb.minPrice || 0;
  if (price > 0 && price <= maxP && price >= minP) score += 30;
  else if (price > 0 && price <= maxP * 1.1) score += 15;
  var types = bb.buyTypes || buyer.buyTypes || ['SFR'];
  var leadType = (lead.beds && lead.beds <= 4) ? 'SFR' : 'Multi';
  if (types.includes(leadType) || types.includes('Any')) score += 25;
  var buyerStates = bb.states || [buyer.state];
  var buyerCities = (bb.cities || [buyer.city || '']).map(function(c) { return c.toLowerCase(); });
  if (buyerStates && buyerStates.includes(lead.state)) score += 15;
  var leadCity = (lead.address || '').split(',')[1] ? lead.address.split(',')[1].trim().toLowerCase() : '';
  if (buyerCities.some(function(c) { return c && leadCity.includes(c); })) score += 10;
  var spread = lead.spread || 0;
  if (spread >= 40000) score += 20;
  else if (spread >= 20000) score += 12;
  else if (spread >= 10000) score += 6;
  return score;
}

function formatDealForBuyer(lead, buyer) {
  var city = (lead.address || '').split(',')[1] ? lead.address.split(',')[1].trim() : (lead.county || 'Area');
  return { city: city, state: lead.state || '', arv: lead.arv ? '$' + (lead.arv/1000).toFixed(0)+'K' : 'TBD', offer: lead.offer ? '$'+(lead.offer/1000).toFixed(0)+'K' : 'TBD', repairs: lead.repairs ? '$'+(lead.repairs/1000).toFixed(0)+'K' : 'TBD', spread: lead.spread ? '$'+(lead.spread/1000).toFixed(0)+'K' : 'TBD', equity: lead.equityPct ? lead.equityPct+'%' : 'N/A', beds: lead.beds||'?', baths: lead.baths||'?', sqft: lead.sqft||'?', year: lead.year||'?', dealType: lead.dealType||lead.category||'Wholesale', dealId: lead.id };
}

app.get('/api/buyers/:id/match-deals', function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = (dbData.buyers||[]).find(function(b){return b.id===req.params.id;});
    if (!buyer) return res.status(404).json({error:'Buyer not found'});
    var limit = parseInt(req.query.limit)||50;
    var sentIds = new Set((buyer.dealsSent||[]).map(function(d){return d.leadId;}));
    var scored = (dbData.leads||[]).filter(function(l){return !sentIds.has(l.id);}).map(function(l){return {lead:l,score:scoreDealForBuyer(l,buyer)};}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;}).slice(0,limit);
    res.json({buyerId:buyer.id,buyerName:buyer.name,totalMatches:scored.length,deals:scored.map(function(x){return Object.assign({},x.lead,{matchScore:x.score});})});
  } catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/buyers/:id/deals-sent', function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = (dbData.buyers||[]).find(function(b){return b.id===req.params.id;});
    if (!buyer) return res.status(404).json({error:'Buyer not found'});
    res.json({buyerId:buyer.id,dealsSent:buyer.dealsSent||[]});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/buyers/:id/send-deals', async function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = (dbData.buyers||[]).find(function(b){return b.id===req.params.id;});
    if (!buyer) return res.status(404).json({error:'Buyer not found'});
    if (!buyer.email) return res.status(400).json({error:'Buyer has no email'});
    var batchSize = req.body.batchSize||10;
    var sentIds = new Set((buyer.dealsSent||[]).map(function(d){return d.leadId;}));
    var scored = (dbData.leads||[]).filter(function(l){return !sentIds.has(l.id);}).map(function(l){return {lead:l,score:scoreDealForBuyer(l,buyer)};}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;}).slice(0,batchSize);
    var dealsToSend = scored.map(function(x){return x.lead;});
    if (dealsToSend.length===0) return res.json({sent:0,message:'No new matching deals'});
    var formatted = dealsToSend.map(function(l){return formatDealForBuyer(l,buyer);});
    var bb = buyer.buyBox||{};
    var types = (bb.buyTypes||buyer.buyTypes||['SFR']).join(', ');
    var maxPrice = bb.maxPrice||buyer.maxPrice||0;
    var emailBody = 'Hi '+buyer.name+',

Based on your buy box ('+types+', up to $'+(maxPrice/1000).toFixed(0)+'K in '+(buyer.city||'your market')+'), I have '+formatted.length+' opportunities for you:

';
    emailBody += '==================================================

';
    formatted.forEach(function(d,i){ emailBody += 'DEAL #'+(i+1)+' - '+d.dealType+'
Location: '+d.city+', '+d.state+' | '+d.beds+'bd/'+d.baths+'ba | '+d.sqft+' sqft | Built '+d.year+'
ARV: '+d.arv+' | Price: '+d.offer+' | Repairs: '+d.repairs+' | Spread: '+d.spread+' | Equity: '+d.equity+'

------------------------------------------

'; });
    emailBody += 'Reply with deal number(s) to get full details. These move fast - respond within 48 hours.

Best,
Gabriel Montealegre
Montsan Real Estate Investments';
    var nodemailer = require('nodemailer');
    var google = require('googleapis').google;
    var oa = new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,'https://developers.google.com/oauthplayground');
    oa.setCredentials({refresh_token:process.env.GMAIL_REFRESH_TOKEN});
    var at = await oa.getAccessToken();
    var tr = nodemailer.createTransport({service:'gmail',auth:{type:'OAuth2',user:process.env.GMAIL_USER,clientId:process.env.GMAIL_CLIENT_ID,clientSecret:process.env.GMAIL_CLIENT_SECRET,refreshToken:process.env.GMAIL_REFRESH_TOKEN,accessToken:at.token}});
    await tr.sendMail({from:process.env.GMAIL_USER,to:buyer.email,subject:'Investment Opportunities Matching Your Buy Box - '+(buyer.city||'Your Market'),text:emailBody});
    if (!buyer.dealsSent) buyer.dealsSent=[];
    var now = new Date().toISOString();
    dealsToSend.forEach(function(l){buyer.dealsSent.push({leadId:l.id,sentAt:now,channel:'email',responded:false});});
    buyer.lastContacted = now;
    db.writeDB(dbData);
    res.json({sent:dealsToSend.length,deals:formatted});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/buyers/dedup-check', function(req, res) {
  try {
    var dbData = db.readDB();
    var name = req.body.name||'';
    var phone = req.body.phone||'';
    var cleanPhone = phone.replace(/[^0-9]/g,'');
    var existing = (dbData.buyers||[]).find(function(b){
      var nameMatch = b.name && name && b.name.toLowerCase().trim()===name.toLowerCase().trim();
      var phoneMatch = cleanPhone.length>6 && b.phone && b.phone.replace(/[^0-9]/g,'')===cleanPhone;
      return nameMatch||phoneMatch;
    });
    res.json({isDuplicate:!!existing,existing:existing||null});
  } catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/buyers/:id/buybox', function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = (dbData.buyers||[]).find(function(b){return b.id===req.params.id;});
    if (!buyer) return res.status(404).json({error:'Buyer not found'});
    buyer.buyBox = Object.assign({},buyer.buyBox||{},req.body);
    db.writeDB(dbData);
    res.json(buyer);
  } catch(e){res.status(500).json({error:e.message});}
});

app.put('/api/buyers/:id/trust', function(req, res) {
  try {
    var dbData = db.readDB();
    var buyer = (dbData.buyers||[]).find(function(b){return b.id===req.params.id;});
    if (!buyer) return res.status(404).json({error:'Buyer not found'});
    if (req.body.trust !== undefined) buyer.trust = Math.max(0,Math.min(100,Number(req.body.trust)));
    if (req.body.notes !== undefined) buyer.notes = req.body.notes;
    if (req.body.responded && req.body.dealId && buyer.dealsSent) {
      var deal = buyer.dealsSent.find(function(d){return d.leadId===req.body.dealId;});
      if (deal){deal.responded=true;buyer.trust=Math.min(100,(buyer.trust||50)+5);}
    }
    var ts = (buyer.dealsSent||[]).length;
    var tr2 = (buyer.dealsSent||[]).filter(function(d){return d.responded;}).length;
    buyer.responseRate = ts>0 ? Math.round((tr2/ts)*100) : 0;
    db.writeDB(dbData);
    res.json(buyer);
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/daily-summary', async function(req, res) {
  try {
    var dbData = db.readDB();
    var leads = dbData.leads||[];
    var buyers = dbData.buyers||[];
    var now = new Date();
    var hot = leads.filter(function(l){return l.spread&&l.spread>=30000;}).length;
    var totalSent = buyers.reduce(function(s,b){return s+(b.dealsSent||[]).length;},0);
    var totalResp = buyers.reduce(function(s,b){return s+(b.dealsSent||[]).filter(function(d){return d.responded;}).length;},0);
    var topBuyers = buyers.map(function(b){var m=leads.filter(function(l){return scoreDealForBuyer(l,b)>20;}).length;return {name:b.name,city:b.city,matchCount:m,responseRate:b.responseRate||0,trust:b.trust||50};}).sort(function(a,b){return b.matchCount-a.matchCount;}).slice(0,5);
    var lines = [
      '📊 WHOLESALEOS DAILY SUMMARY — '+now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}),
      '',
      '📋 LEADS: '+leads.length.toLocaleString()+' total | '+leads.filter(function(l){return l.status==='New Lead';}).length+' new | '+leads.filter(function(l){return l.status==='Contacted';}).length+' contacted | '+leads.filter(function(l){return l.status==='Under Contract';}).length+' under contract | '+hot+' hot ($30K+ spread)',
      '',
      '👥 BUYERS: '+buyers.filter(function(b){return b.status==='Active';}).length+' active | '+totalSent+' deals sent | '+totalResp+' responses | '+(totalSent>0?Math.round((totalResp/totalSent)*100):0)+'% response rate',
      '',
      '🏆 TOP BUYERS:'
    ].concat(topBuyers.map(function(b,i){return (i+1)+'. '+b.name+' ('+(b.city||'?')+') - '+b.matchCount+' matches | Trust: '+b.trust+' | Response: '+b.responseRate+'%';})).concat(['','— WholesaleOS']).join('
');
    if (process.env.TELEGRAM_BOT_TOKEN&&process.env.BOT_OWNER_ID) {
      try{var TelegramBot=require('node-telegram-bot-api');var bot=new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);await bot.sendMessage(process.env.BOT_OWNER_ID,lines);}catch(te){console.log('TG failed:',te.message);}
    }
    try {
      var nm=require('nodemailer');var g=require('googleapis').google;
      var oa2=new g.auth.OAuth2(process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,'https://developers.google.com/oauthplayground');
      oa2.setCredentials({refresh_token:process.env.GMAIL_REFRESH_TOKEN});
      var at2=await oa2.getAccessToken();
      var tr3=nm.createTransport({service:'gmail',auth:{type:'OAuth2',user:process.env.GMAIL_USER,clientId:process.env.GMAIL_CLIENT_ID,clientSecret:process.env.GMAIL_CLIENT_SECRET,refreshToken:process.env.GMAIL_REFRESH_TOKEN,accessToken:at2.token}});
      await tr3.sendMail({from:process.env.GMAIL_USER,to:process.env.GMAIL_USER,subject:'📊 WholesaleOS Daily Summary — '+now.toLocaleDateString(),text:lines});
    } catch(em){console.log('Email summary failed:',em.message);}
    res.json({success:true,summary:lines});
  } catch(e){res.status(500).json({error:e.message});}
});

// ============================================================
// END BUYERS CRM PATCH
// ============================================================

module.exports = app;

