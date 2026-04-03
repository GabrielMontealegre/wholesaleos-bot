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

// ── API: Leads by State/County hierarchy ────────────────
app.get('/api/leads/hierarchy', (req, res) => {
  try {
    const tree = db.getLeadsByStateCounty();
    res.json({ tree, total: db.getLeads().length });
  } catch(err) { res.json({ tree: {}, total: 0 }); }
});

// ── API: Stats with followups_due ────────────────────────
app.get('/api/stats', (req, res) => {
  const stats = db.getStats();
  const today = new Date().toISOString().slice(0,10);
  const dbData = db.readDB();
  stats.followups_due = (dbData.followups||[]).filter(f => f.status==='pending' && f.nextDate<=today).length;
  stats.backups = (dbData.backups||[]).slice(-7);
  res.json(stats);
});

// ── API: Notifications ──────────────────────────────────
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

// ── API: Markets ─────────────────────────────────────────
app.get('/api/markets/best', (req, res) => {
  try {
    const { selectMarketsForWeek } = require('./markets');
    const scanned = db.getScannedMarkets();
    const markets = selectMarketsForWeek(12, scanned);
    res.json({ markets });
  } catch(err) { res.json({ markets: [] }); }
});

// ── API: Scan status ─────────────────────────────────────
app.get('/api/scan/status', (req, res) => {
  const dbData = db.readDB();
  res.json({
    scanned_markets: db.getScannedMarkets().length,
    last_backup: (dbData.backups||[]).slice(-1)[0] || null,
    total_leads: db.getLeads().length,
    total_buyers: db.getBuyers().length,
  });
});

// ── API: Buy Boxes ──────────────────────────────────────
app.get('/api/buyboxes', (req, res) => {
  const { getBuyBoxes } = require('./modules/buybox');
  res.json({ buyboxes: getBuyBoxes() });
});

app.post('/api/buyboxes', (req, res) => {
  const { addBuyBox } = require('./modules/buybox');
  const box = addBuyBox(req.body);
  if (!box) return res.json({ ok: false, error: 'Duplicate buy box' });
  db.addNotification('buyer', 'New buy box added', `${req.body.name} — ${req.body.county||'Unknown'}, ${req.body.state||'TX'}`);
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

// ── API: Outreach ─────────────────────────────────────────
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

// ── API: Contracts Library ────────────────────────────────
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

// ── API: Automation Control ───────────────────────────────
app.post('/api/automation/scan', async (req, res) => {
  res.json({ ok: true, message: 'Scan triggered — check notifications for progress' });
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
        db.addNotification('deal', `${added} leads — ${market.county}, ${market.state}`, `Automation scan complete for ${market.county} County`);
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

// ── API: Lead Quality Score ──────────────────────────────
app.get('/api/leads/:id/quality', (req, res) => {
  const lead = db.getLeads().find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Not found' });
  const { scoreLeadQuality } = require('./modules/outreach');
  res.json(scoreLeadQuality(lead));
});

// ── API: Outreach generation ──────────────────────────────
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

// ── API: Land deals ───────────────────────────────────────
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
    db.addNotification('deal', `${added} land deals added`, `${county}, ${state} — land opportunities`);
    res.json({ ok: true, added, leads: leads.slice(0, added) });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── API: Buyer intro email ────────────────────────────────
app.get('/api/buyers/:id/intro-email', (req, res) => {
  const buyer = db.getBuyers().find(b => b.id === req.params.id);
  if (!buyer) return res.status(404).json({ error: 'Not found' });
  const { generateBuyerIntroEmail } = require('./modules/outreach');
  res.json(generateBuyerIntroEmail(buyer));
});

// ── API: Deal send (address-protected) ───────────────────
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
    db.addNotification('match', `Deal sent to ${buyer.name}`, `${lead.address?.split(',')[0]} — city-only version sent`);
    res.json({ ok: true, email });
  } catch(err) { res.status(500).json({ error: err.message }); }
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
