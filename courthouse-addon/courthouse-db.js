/**
 * CourthouseDB — isolated database for courthouse leads
 * Completely separate from the main WholesaleOS db.js
 * Uses its own JSON file: courthouse-leads.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

class CourthouseDB {
  constructor(dbPath) {
    this.dbPath = dbPath || path.join(__dirname, 'courthouse-leads.json');
    this._cache = null;
  }

  read() {
    if (!fs.existsSync(this.dbPath)) {
      return { leads: [], lastRun: null, totalProcessed: 0 };
    }
    try {
      return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
    } catch {
      return { leads: [], lastRun: null, totalProcessed: 0 };
    }
  }

  write(data) {
    fs.writeFileSync(this.dbPath, JSON.stringify(data, null, 2));
    this._cache = null;
  }

  getLeads(filters = {}) {
    const db = this.read();
    let leads = db.leads || [];
    if (filters.state)    leads = leads.filter(l => l.state === filters.state);
    if (filters.type)     leads = leads.filter(l => (l.lead_type||'').includes(filters.type));
    if (filters.flag)     leads = leads.filter(l => (l.priority_flags||[]).includes(filters.flag));
    if (filters.expiring) leads = leads.filter(l => l.expiring_soon);
    if (filters.daysBack) {
      const cutoff = Date.now() - filters.daysBack * 86400000;
      leads = leads.filter(l => new Date(l.created).getTime() > cutoff);
    }
    return leads;
  }

  appendLeads(newLeads) {
    const db = this.read();
    const existing = new Set((db.leads || []).map(l => this.normalizeAddr(l.address)));
    const added = newLeads.filter(l => {
      const key = this.normalizeAddr(l.address);
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    db.leads = [...(db.leads || []), ...added];
    db.lastRun = new Date().toISOString();
    db.totalProcessed = (db.totalProcessed || 0) + added.length;
    this.write(db);
    return added.length;
  }

  getAddressSet() {
    const db = this.read();
    return new Set((db.leads || []).map(l => this.normalizeAddr(l.address)).filter(Boolean));
  }

  getStats() {
    const db = this.read();
    const leads = db.leads || [];
    const byType = {}, byState = {};
    let expiring = 0;
    leads.forEach(l => {
      byType[l.lead_type]  = (byType[l.lead_type]  || 0) + 1;
      byState[l.state]     = (byState[l.state]      || 0) + 1;
      if (l.expiring_soon) expiring++;
    });
    return { total: leads.length, expiring, byType, byState, lastRun: db.lastRun };
  }

  normalizeAddr(addr) {
    if (!addr) return null;
    return addr.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

module.exports = CourthouseDB;
