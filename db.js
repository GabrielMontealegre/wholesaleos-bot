// db.js — Simple JSON database. Free. No external service needed.
// Upgrade path: swap readDB/writeDB for Airtable API calls later

const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/db.json';

const DEFAULT = {
  leads:       [],
  buyers:      [],
  assignments: [],
  calendar:    [],
  settings:    { ai_mode: 'free', counties_searched: [] },
  meta:        { last_updated: null, total_leads_ever: 0 }
};

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDB() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT));
  }
}

function writeDB(data) {
  ensureDir();
  data.meta.last_updated = new Date().toISOString();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// ── LEADS ──────────────────────────────────────────────────────────────────
function addLead(lead) {
  const db = readDB();
  lead.id = Date.now().toString();
  lead.created = new Date().toISOString().slice(0, 10);
  lead.status = lead.status || 'New Lead';
  db.leads.unshift(lead);
  db.meta.total_leads_ever += 1;
  writeDB(db);
  return lead;
}

function getLeads(filters = {}) {
  const db = readDB();
  let leads = db.leads;
  if (filters.county)   leads = leads.filter(l => l.county?.toLowerCase().includes(filters.county.toLowerCase()));
  if (filters.status)   leads = leads.filter(l => l.status === filters.status);
  if (filters.category) leads = leads.filter(l => l.category === filters.category);
  if (filters.county_zip) leads = leads.filter(l => l.zip?.startsWith(filters.county_zip));
  return leads;
}

function updateLead(id, updates) {
  const db = readDB();
  const idx = db.leads.findIndex(l => l.id === id);
  if (idx >= 0) { db.leads[idx] = { ...db.leads[idx], ...updates }; writeDB(db); return db.leads[idx]; }
  return null;
}

function leadExists(address) {
  const db = readDB();
  return db.leads.some(l => l.address?.toLowerCase() === address?.toLowerCase());
}

// ── BUYERS ─────────────────────────────────────────────────────────────────
function addBuyer(buyer) {
  const db = readDB();
  buyer.id = Date.now().toString();
  buyer.created = new Date().toISOString().slice(0, 10);
  buyer.closings = 0;
  buyer.status = 'Active';
  db.buyers.push(buyer);
  writeDB(db);
  return buyer;
}

function getBuyers(type = null) {
  const db = readDB();
  return type ? db.buyers.filter(b => b.type === type) : db.buyers;
}

function matchBuyersToLead(lead) {
  const db = readDB();
  return db.buyers.filter(b => {
    const arvMatch = (!b.maxPrice || b.maxPrice >= lead.arv * 0.75) &&
                     (!b.minARV   || b.minARV   <= lead.arv);
    return arvMatch && b.status === 'Active';
  });
}

// ── ASSIGNMENTS ────────────────────────────────────────────────────────────
function addAssignment(asgn) {
  const db = readDB();
  asgn.id = Date.now().toString();
  asgn.created = new Date().toISOString().slice(0, 10);
  asgn.status = 'Under Contract';
  asgn.contractSent = false;
  db.assignments.push(asgn);
  writeDB(db);
  return asgn;
}

function getAssignments() {
  return readDB().assignments;
}

// ── CALENDAR ───────────────────────────────────────────────────────────────
function addEvent(evt) {
  const db = readDB();
  evt.id = Date.now().toString();
  db.calendar.push(evt);
  writeDB(db);
  return evt;
}

function getUpcomingEvents(days = 14) {
  const db    = readDB();
  const now   = new Date();
  const limit = new Date(now.getTime() + days * 86400000);
  return db.calendar
    .filter(e => { const d = new Date(e.date); return d >= now && d <= limit; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

// ── SETTINGS ───────────────────────────────────────────────────────────────
function getSetting(key) { return readDB().settings[key]; }
function setSetting(key, val) {
  const db = readDB();
  db.settings[key] = val;
  writeDB(db);
}

function getStats() {
  const db = readDB();
  const closed     = db.assignments.filter(a => a.status === 'Closed');
  const pipeline   = db.assignments.filter(a => a.status === 'Under Contract');
  const totalFees  = closed.reduce((s, a) => s + (a.assignmentFee || 0), 0);
  const pipeFees   = pipeline.reduce((s, a) => s + (a.assignmentFee || 0), 0);
  return {
    total_leads:      db.leads.length,
    new_leads:        db.leads.filter(l => l.status === 'New Lead').length,
    under_contract:   db.leads.filter(l => l.status === 'Under Contract').length,
    closed_deals:     closed.length,
    active_buyers:    db.buyers.filter(b => b.status === 'Active').length,
    fees_collected:   totalFees,
    fees_pipeline:    pipeFees,
    total_ever:       db.meta.total_leads_ever
  };
}

module.exports = {
  addLead, getLeads, updateLead, leadExists,
  addBuyer, getBuyers, matchBuyersToLead,
  addAssignment, getAssignments,
  addEvent, getUpcomingEvents,
  getSetting, setSetting, getStats, readDB, writeDB
};
