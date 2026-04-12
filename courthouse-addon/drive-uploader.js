/**
 * DriveUploader — uploads downloaded courthouse files to Google Drive
 * Folder structure: /Courthouse_Automation/Raw_Downloads/State/County/YYYY-MM-DD/
 */

'use strict';

const fs   = require('fs');
const path = require('path');

class DriveUploader {
  constructor() {
    this.drive     = null;
    this.rootId    = null;
    this.folderCache = {};
    this.enabled   = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  }

  async init() {
    if (this.drive || !this.enabled) return;
    try {
      const { google } = require('googleapis');
      const keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      const key = typeof keyJson === 'string' ? JSON.parse(keyJson) : keyJson;
      const auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      this.drive = google.drive({ version: 'v3', auth });
      this.rootId = await this.ensureFolder('Courthouse_Automation', null);
    } catch (err) {
      console.log(`    Drive init failed: ${err.message} — uploads disabled`);
      this.enabled = false;
    }
  }

  async upload(filePath, src, dateStr) {
    if (!this.enabled) return null;
    await this.init();
    if (!this.drive) return null;

    try {
      // Build folder path: Root > Raw_Downloads > State > Market > Date
      const rawId    = await this.ensureFolder('Raw_Downloads', this.rootId);
      const stateId  = await this.ensureFolder(src.state, rawId);
      const marketId = await this.ensureFolder(src.market.replace(/[^a-z0-9 ]/gi, '_'), stateId);
      const dateId   = await this.ensureFolder(dateStr, marketId);

      const fileName = path.basename(filePath);
      const mimeType = this.getMimeType(filePath);
      const fileSize = fs.statSync(filePath).size;

      if (fileSize === 0) return null;

      const res = await this.drive.files.create({
        requestBody: {
          name:    fileName,
          parents: [dateId],
        },
        media: {
          mimeType,
          body: fs.createReadStream(filePath),
        },
        fields: 'id,name,webViewLink',
      });

      return res.data.webViewLink;
    } catch (err) {
      console.log(`    Drive upload error: ${err.message}`);
      return null;
    }
  }

  async uploadProcessed(leads, category = 'Processed_Leads') {
    if (!this.enabled || !leads.length) return null;
    await this.init();
    if (!this.drive) return null;

    const folderId = await this.ensureFolder(category, this.rootId);
    const fileName = `${category}-${new Date().toISOString().slice(0,10)}.json`;
    const content  = JSON.stringify(leads, null, 2);
    const tmpPath  = `/tmp/${fileName}`;
    fs.writeFileSync(tmpPath, content);

    const res = await this.drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'application/json', body: fs.createReadStream(tmpPath) },
      fields: 'id,webViewLink',
    }).catch(() => null);

    fs.unlinkSync(tmpPath);
    return res?.data?.webViewLink;
  }

  // ── Folder helpers ───────────────────────────────────────────────
  async ensureFolder(name, parentId) {
    const cacheKey = `${parentId}:${name}`;
    if (this.folderCache[cacheKey]) return this.folderCache[cacheKey];

    const query = [
      `name='${name.replace(/'/g, "\\'")}'`,
      `mimeType='application/vnd.google-apps.folder'`,
      `trashed=false`,
      parentId ? `'${parentId}' in parents` : null
    ].filter(Boolean).join(' and ');

    const list = await this.drive.files.list({ q: query, fields: 'files(id)' });
    let id;
    if (list.data.files.length) {
      id = list.data.files[0].id;
    } else {
      const created = await this.drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: parentId ? [parentId] : [],
        },
        fields: 'id',
      });
      id = created.data.id;
    }
    this.folderCache[cacheKey] = id;
    return id;
  }

  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
      '.csv':  'text/csv',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.xls':  'application/vnd.ms-excel',
      '.pdf':  'application/pdf',
      '.json': 'application/json',
      '.html': 'text/html',
    };
    return map[ext] || 'application/octet-stream';
  }
}

module.exports = DriveUploader;
