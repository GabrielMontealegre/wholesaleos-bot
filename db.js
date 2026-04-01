// db.js — JSON file database with full CRM support
require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/db.json';
const DB_FILE = path.resolve(DB_PATH);
const DB_DIR  = path.dirname(DB_FILE);

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
}

function readDB() {
  ensureDir();
  if (!fs.existsSync(DB_FILE)) return { leads:[], buyers:[], assignments:[], calendar:[], followups:[], contracts:[], settings:{} };
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { leads:[], buyers:[], assignments:[], calendar:[], followups:[], contracts:[], settings:{} }; }
}

function writeDB(data) {
  ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Leads ──────────────────────────────────────────────
function getLeads() { return readDB().leads || []; }

function addLead(lead) {
  const db = readDB();
  if (!db.leads) db.leads = [];
  const newLead = {
    id:      'L' + Date.now() + Math.random().toString(36).slice(2,6),
    status:  'New Lead',
    created: new Date().toISOString().slice(0,10),
    ...lead,
  };
  db.leads.unshift(newLead);
  writeDB(db);
  return newLead;
}

function updateLead(id, updates) {
  const db = readDB();
  const idx = (db.leads||[]).findIndex(l => l.id === id);
  if (idx === -1) return null;
  db.leads[idx] = { ...db.leads[idx], ...updates };
  writeDB(db);
  return db.leads[idx];
}

function leadExists(address) {
  if (!address) return false;
  // Normalize: lowercase, remove extra spaces
  const norm = a => (a||'').toLowerCase().trim().replace(/\s+/g,' ');
  const newAddr = norm(address);
  return getLeads().some(l => norm(l.address) === newAddr);
}

function clearFakeLeads() {
  // Remove leads with obviously fake/generic addresses
  const db = readDB();
  const fakePatterns = [/^\d{3,4}\s+(oak|maple|elm|cedar|palm|pine|main|first|second)\s+(st|ave|blvd|dr)/i];
  const before = (db.leads||[]).length;
  db.leads = (db.leads||[]).filter(l => !fakePatterns.some(p => p.test(l.address||'')));
  if (db.leads.length < before) { writeDB(db); }
  return before - db.leads.length;
}

// ── Buyers ─────────────────────────────────────────────
function getBuyers() { return readDB().buyers || []; }

function addBuyer(buyer) {
  const db = readDB();
  if (!db.buyers) db.buyers = [];
  const newBuyer = {
    id:      'B' + Date.now(),
    status:  'Active',
    score:   75,
    closings: 0,
    created: new Date().toISOString().slice(0,10),
    ...buyer,
  };
  db.buyers.push(newBuyer);
  writeDB(db);
  return newBuyer;
}

function matchBuyersToLead(lead) {
  return getBuyers().filter(b => {
    if (b.status !== 'Active') return false;
    const priceOk = (!b.maxPrice || (lead.arv||0) * 0.85 <= b.maxPrice) &&
                    (!b.minARV   || (lead.arv||0) >= b.minARV);
    return priceOk;
  }).sort((a, b) => (b.score||0) - (a.score||0));
}

// ── Assignments ─────────────────────────────────────────
function getAssignments() { return readDB().assignments || []; }

// ── Calendar / Events ───────────────────────────────────
function getUpcomingEvents(days = 30) {
  const db = readDB();
  const today    = new Date();
  const cutoff   = new Date(); cutoff.setDate(cutoff.getDate() + days);
  return (db.calendar || [])
    .filter(e => { const d = new Date(e.date); return d >= today && d <= cutoff; })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function addEvent(evt) {
  const db = readDB();
  if (!db.calendar) db.calendar = [];
  const newEvt = { id: 'E' + Date.now(), ...evt };
  db.calendar.push(newEvt);
  writeDB(db);
  return newEvt;
}

// ── Stats ───────────────────────────────────────────────
function getStats() {
  const db = readDB();
  const leads       = db.leads || [];
  const assignments = db.assignments || [];
  const buyers      = db.buyers || [];
  const followups   = db.followups || [];
  return {
    total_leads:     leads.length,
    new_leads:       leads.filter(l => l.status === 'New Lead').length,
    contacted:       leads.filter(l => l.status === 'Contacted').length,
    under_contract:  leads.filter(l => l.status === 'Under Contract').length,
    closed_deals:    assignments.filter(a => a.status === 'Closed').length,
    fees_collected:  assignments.filter(a => a.status === 'Closed').reduce((s,a) => s+(a.fee||0), 0),
    fees_pipeline:   assignments.filter(a => a.status !== 'Closed').reduce((s,a) => s+(a.fee||0), 0),
    active_buyers:   buyers.filter(b => b.status === 'Active').length,
    followups_due:   followups.filter(f => f.status === 'pending' && f.nextDate <= new Date().toISOString().slice(0,10)).length,
  };
}

// ── Settings ─────────────────────────────────────────────
function getSetting(key) { return (readDB().settings || {})[key]; }
function setSetting(key, val) {
  const db = readDB();
  if (!db.settings) db.settings = {};
  db.settings[key] = val;
  writeDB(db);
}

module.exports = {
  readDB, writeDB,
  getLeads, addLead, updateLead, leadExists, clearFakeLeads,
  getBuyers, addBuyer, matchBuyersToLead,
  getAssignments,
  getUpcomingEvents, addEvent,
  getStats,
  getSetting, setSetting,
};
