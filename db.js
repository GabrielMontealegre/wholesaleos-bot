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

// ── Notifications system ────────────────────────────────
function addNotification(type, title, message, data={}) {
  const db = readDB();
  if (!db.notifications) db.notifications = [];
  const notif = {
    id: 'N' + Date.now(),
    type, // 'deal','buyer','scan','match','warning','system'
    title, message,
    data,
    read: false,
    created: new Date().toISOString()
  };
  db.notifications.unshift(notif);
  if (db.notifications.length > 200) db.notifications = db.notifications.slice(0,200);
  writeDB(db);
  return notif;
}

function getNotifications(unreadOnly=false) {
  const db = readDB();
  const notifs = db.notifications || [];
  return unreadOnly ? notifs.filter(n => !n.read) : notifs;
}

function markNotificationsRead(ids=[]) {
  const db = readDB();
  if (!db.notifications) return;
  db.notifications.forEach(n => {
    if (ids.length === 0 || ids.includes(n.id)) n.read = true;
  });
  writeDB(db);
}

function getScannedMarkets() {
  return (readDB().scanned_markets || []);
}

function addScannedMarket(stateCode, county) {
  const db = readDB();
  if (!db.scanned_markets) db.scanned_markets = [];
  const key = stateCode + '_' + county;
  if (!db.scanned_markets.includes(key)) {
    db.scanned_markets.push(key);
    if (db.scanned_markets.length > 100) db.scanned_markets = db.scanned_markets.slice(-100);
    writeDB(db);
  }
}

// ── Lead hierarchy: State → County ─────────────────────
function getLeadsByStateCounty() {
  const leads = getLeads();
  const tree = {};
  leads.forEach(l => {
    const state = l.state || 'TX';
    const county = l.county || 'Unknown';
    if (!tree[state]) tree[state] = {};
    if (!tree[state][county]) tree[state][county] = [];
    tree[state][county].push(l);
  });
  // Sort each county's leads by spread desc
  Object.values(tree).forEach(counties =>
    Object.values(counties).forEach(leads =>
      leads.sort((a,b) => (b.spread||0)-(a.spread||0))
    )
  );
  return tree;
}

// ── Bulk add buyers (dedup by name+phone) ─────────────
function addBuyersBulk(buyers) {
  const db = readDB();
  if (!db.buyers) db.buyers = [];
  const existing = new Set(db.buyers.map(b => (b.name+b.phone).toLowerCase()));
  let added = 0;
  for (const buyer of buyers) {
    const key = ((buyer.name||'')+(buyer.phone||'')).toLowerCase();
    if (!key || existing.has(key)) continue;
    buyer.id = 'B' + Date.now() + Math.random().toString(36).slice(2,5);
    buyer.status = buyer.status || 'Active';
    buyer.created = new Date().toISOString().slice(0,10);
    db.buyers.push(buyer);
    existing.add(key);
    added++;
  }
  writeDB(db);
  return added;
}

// ══════════════════════════════════════════════════════════
//  USER MANAGEMENT SYSTEM
// ══════════════════════════════════════════════════════════

const DEFAULT_USERS = [
  { id:'admin', name:'Gabriel (Admin)', pin:'1234', role:'admin', color:'#1d1d1f', initials:'GA', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u2',  name:'User 2',  pin:'2001', role:'user', color:'#0071e3', initials:'U2', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u3',  name:'User 3',  pin:'2002', role:'user', color:'#34c759', initials:'U3', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u4',  name:'User 4',  pin:'2003', role:'user', color:'#ff9500', initials:'U4', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u5',  name:'User 5',  pin:'2004', role:'user', color:'#ff3b30', initials:'U5', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u6',  name:'User 6',  pin:'2005', role:'user', color:'#5e5ce6', initials:'U6', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u7',  name:'User 7',  pin:'2006', role:'user', color:'#ff6b35', initials:'U7', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u8',  name:'User 8',  pin:'2007', role:'user', color:'#30d158', initials:'U8', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u9',  name:'User 9',  pin:'2008', role:'user', color:'#64d2ff', initials:'U9', created: new Date().toISOString().slice(0,10), firstLogin: true },
  { id:'u10', name:'User 10', pin:'2009', role:'user', color:'#bf5af2', initials:'U10', created: new Date().toISOString().slice(0,10), firstLogin: true },
];

function getUsers() {
  const db = readDB();
  if (!db.users || db.users.length === 0) {
    db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
    writeDB(db);
  }
  return db.users;
}

function getUserByPin(pin) {
  return getUsers().find(u => u.pin === String(pin));
}

function getUserById(id) {
  return getUsers().find(u => u.id === id);
}

function updateUser(id, updates) {
  const db = readDB();
  if (!db.users) db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  const user = db.users.find(u => u.id === id);
  if (!user) return null;
  // PIN uniqueness check
  if (updates.pin && updates.pin !== user.pin) {
    const taken = db.users.find(u => u.pin === updates.pin && u.id !== id);
    if (taken) return { error: 'PIN already in use by another account' };
  }
  Object.assign(user, updates);
  writeDB(db);
  return user;
}

function addUser(data) {
  const db = readDB();
  if (!db.users) db.users = JSON.parse(JSON.stringify(DEFAULT_USERS));
  // Check PIN uniqueness
  if (db.users.find(u => u.pin === data.pin)) return { error: 'PIN already in use' };
  const user = {
    id: 'u' + Date.now(),
    name: data.name || 'New User',
    pin: data.pin,
    role: data.role || 'user',
    color: data.color || '#86868b',
    initials: (data.name||'U').slice(0,2).toUpperCase(),
    created: new Date().toISOString().slice(0,10),
    firstLogin: true,
  };
  db.users.push(user);
  writeDB(db);
  return user;
}

// ── Lead filtering by user ────────────────────────────────
function getLeadsForUser(userId) {
  const leads = getLeads();
  if (userId === 'admin') return leads; // Admin sees all
  return leads.filter(l => l.userId === userId || !l.userId); // User sees own + untagged
}

function getLeadsByStateCountyForUser(userId) {
  const leads = getLeadsForUser(userId);
  const tree = {};
  leads.forEach(l => {
    const state = l.state || 'TX';
    const county = l.county || 'Unknown';
    if (!tree[state]) tree[state] = {};
    if (!tree[state][county]) tree[state][county] = [];
    tree[state][county].push(l);
  });
  Object.values(tree).forEach(counties =>
    Object.values(counties).forEach(arr =>
      arr.sort((a,b) => (b.spread||0)-(a.spread||0))
    )
  );
  return tree;
}

// ── Stats per user ────────────────────────────────────────
function getStatsForUser(userId) {
  const leads = getLeadsForUser(userId);
  const today = new Date().toISOString().slice(0,10);
  const buyers = getBuyers(); // shared
  const assignments = getAssignments();
  return {
    total_leads: leads.length,
    new_leads: leads.filter(l => l.status === 'New Lead').length,
    new_today: leads.filter(l => l.created === today).length,
    under_contract: leads.filter(l => l.status === 'Under Contract').length,
    closed_deals: leads.filter(l => l.status === 'Closed').length,
    fees_collected: assignments.filter(a => a.status === 'Closed' && (userId==='admin'||a.userId===userId)).reduce((s,a) => s+(a.fee||0), 0),
    fees_pipeline: leads.filter(l => ['Offer Sent','Negotiating','Under Contract'].includes(l.status)).reduce((s,l) => s+(l.fee_hi||0), 0),
    active_buyers: buyers.filter(b => b.status === 'Active').length,
  };
}

// ── Archived leads (90-day rule) ─────────────────────────
function archiveStaleLeads() {
  const db = readDB();
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0,10);
  if (!db.archived_leads) db.archived_leads = [];
  const toArchive = (db.leads||[]).filter(l =>
    l.status === 'New Lead' &&
    l.created <= cutoffStr &&
    !l.contacted_at
  );
  if (toArchive.length === 0) return 0;
  db.archived_leads.push(...toArchive.map(l => ({...l, archived_at: new Date().toISOString().slice(0,10)})));
  db.leads = (db.leads||[]).filter(l => !toArchive.find(a => a.id === l.id));
  writeDB(db);
  return toArchive.length;
}

function checkLeadLimit() {
  const count = (readDB().leads||[]).length;
  if (count >= 9500) {
    addNotification('warning', 'Lead limit approaching', count + '/10,000 leads stored. Archiving oldest uncontacted leads.');
    archiveStaleLeads();
  }
  return count;
}

// ── Pending buyers (user-submitted, needs admin approval) ─
function addPendingBuyer(buyerData, userId) {
  const db = readDB();
  if (!db.pending_buyers) db.pending_buyers = [];
  const pending = { ...buyerData, id: 'PB' + Date.now(), submittedBy: userId, submittedAt: new Date().toISOString(), status: 'pending' };
  db.pending_buyers.push(pending);
  writeDB(db);
  addNotification('buyer', 'Buyer pending approval', (buyerData.name||'Unknown') + ' submitted by ' + userId, { pendingId: pending.id });
  return pending;
}

function getPendingBuyers() {
  return (readDB().pending_buyers || []).filter(b => b.status === 'pending');
}

function approvePendingBuyer(pendingId) {
  const db = readDB();
  const pending = (db.pending_buyers||[]).find(b => b.id === pendingId);
  if (!pending) return null;
  pending.status = 'approved';
  const { submittedBy, submittedAt, status, ...buyerData } = pending;
  const buyer = addBuyer(buyerData);
  writeDB(db);
  return buyer;
}

function rejectPendingBuyer(pendingId) {
  const db = readDB();
  const pending = (db.pending_buyers||[]).find(b => b.id === pendingId);
  if (pending) { pending.status = 'rejected'; writeDB(db); }
}

// ── State population tracking ─────────────────────────────
function isStatePopulated(stateCode) {
  const db = readDB();
  return (db.populated_states || []).includes(stateCode);
}

function markStatePopulated(stateCode) {
  const db = readDB();
  if (!db.populated_states) db.populated_states = [];
  if (!db.populated_states.includes(stateCode)) {
    db.populated_states.push(stateCode);
    writeDB(db);
  }
}

module.exports = {
  readDB, writeDB,
  getLeads, addLead, updateLead, leadExists, clearFakeLeads,
  getUsers, getUserByPin, getUserById, updateUser, addUser,
  getLeadsForUser, getLeadsByStateCountyForUser, getStatsForUser,
  archiveStaleLeads, checkLeadLimit,
  addPendingBuyer, getPendingBuyers, approvePendingBuyer, rejectPendingBuyer,
  isStatePopulated, markStatePopulated,
  getLeadsByStateCounty, addBuyersBulk,
  addNotification, getNotifications, markNotificationsRead,
  getScannedMarkets, addScannedMarket,
  getBuyers, addBuyer, matchBuyersToLead,
  getAssignments,
  getUpcomingEvents, addEvent,
  getStats,
  getSetting, setSetting,
};
