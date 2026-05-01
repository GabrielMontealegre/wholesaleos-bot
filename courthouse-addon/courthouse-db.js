'use strict';
const fs   = require('fs');
const path = require('path');

class CourthouseDB {
  constructor(dbFile) {
    this.dbFile = dbFile || path.join(__dirname, 'courthouse-leads.json');
    this._data  = null;
  }

  _load() {
    if (this._data) return this._data;
    try {
      this._data = JSON.parse(fs.readFileSync(this.dbFile, 'utf8'));
    } catch(e) {
      this._data = { leads: [], addresses: [] };
    }
    return this._data;
  }

  _save() {
    fs.writeFileSync(this.dbFile, JSON.stringify(this._data, null, 2));
  }

  getAddressSet() {
    var data = this._load();
    return new Set((data.addresses || []));
  }

  appendLeads(leads) {
    var data = this._load();
    if (!data.leads)     data.leads     = [];
    if (!data.addresses) data.addresses = [];
    var addrSet = new Set(data.addresses);
    var added = 0;
    leads.forEach(function(lead) {
      var key = (lead.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || addrSet.has(key)) return;
      data.leads.push(lead);
      data.addresses.push(key);
      addrSet.add(key);
      added++;
    });
    if (added > 0) this._save();
    return added;
  }

  getLeads() {
    return this._load().leads || [];
  }

  count() {
    return (this._load().leads || []).length;
  }
}

module.exports = CourthouseDB;
