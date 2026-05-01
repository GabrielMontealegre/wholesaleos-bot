'use strict';
const path   = require('path');
const fs     = require('fs');
const { google } = require('googleapis');

// Folder structure: WholesaleOS / {State} / {lead_type}
const ROOT_FOLDER_NAME = 'WholesaleOS Courthouse Leads';

function getTypeFolder(sourceType) {
  var t = (sourceType || '').toLowerCase();
  if (t.indexOf('tax') > -1 || t.indexOf('lien') > -1 || t.indexOf('delinq') > -1) return 'Tax Delinquent';
  if (t.indexOf('foreclos') > -1 || t.indexOf('pre-foreclos') > -1 || t.indexOf('lis pendens') > -1) return 'Pre-Foreclosure';
  if (t.indexOf('auction') > -1 || t.indexOf('probate') > -1) return 'Auctions';
  return 'Other';
}

class DriveUploader {
  constructor() {
    this._drive   = null;
    this._folders = {}; // cache: 'State/Type' -> folderId
    this._rootId  = null;
    this._enabled = false;
    this._initAttempted = false;
  }

  async _init() {
    if (this._initAttempted) return;
    this._initAttempted = true;
    var keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) {
      console.log('[drive-uploader] GOOGLE_SERVICE_ACCOUNT_KEY not set — Drive upload disabled');
      return;
    }
    try {
      var key = JSON.parse(keyJson);
      var auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      this._drive = google.drive({ version: 'v3', auth: await auth.getClient() });
      this._enabled = true;
      console.log('[drive-uploader] initialized OK');
    } catch(e) {
      console.error('[drive-uploader] init error: ' + e.message);
    }
  }

  async _getOrCreateFolder(name, parentId) {
    var cacheKey = (parentId || 'root') + '/' + name;
    if (this._folders[cacheKey]) return this._folders[cacheKey];
    // Search for existing
    var q = "name='" + name + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
    if (parentId) q += " and '" + parentId + "' in parents";
    try {
      var res = await this._drive.files.list({ q: q, fields: 'files(id,name)', pageSize: 5 });
      if (res.data.files && res.data.files.length > 0) {
        this._folders[cacheKey] = res.data.files[0].id;
        return res.data.files[0].id;
      }
      // Create it
      var meta = { name: name, mimeType: 'application/vnd.google-apps.folder' };
      if (parentId) meta.parents = [parentId];
      var created = await this._drive.files.create({ requestBody: meta, fields: 'id' });
      this._folders[cacheKey] = created.data.id;
      return created.data.id;
    } catch(e) {
      console.error('[drive-uploader] folder error: ' + e.message);
      return null;
    }
  }

  async upload(filePath, src, dateStr) {
    await this._init();
    if (!this._enabled || !this._drive) return { skipped: true, reason: 'drive not enabled' };
    if (!filePath || !fs.existsSync(filePath)) return { skipped: true, reason: 'file not found' };

    try {
      // Folder: WholesaleOS / State / TypeFolder
      if (!this._rootId) {
        this._rootId = await this._getOrCreateFolder(ROOT_FOLDER_NAME, null);
      }
      var stateId  = await this._getOrCreateFolder(src.state || 'Unknown', this._rootId);
      var typeId   = await this._getOrCreateFolder(getTypeFolder(src.type), stateId);

      var filename = path.basename(filePath);
      var ext = path.extname(filename).toLowerCase();
      var mime = ext === '.pdf' ? 'application/pdf'
               : ext === '.csv' ? 'text/csv'
               : ext === '.xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
               : 'application/octet-stream';

      var res = await this._drive.files.create({
        requestBody: {
          name: (src.market || src.state) + '_' + (dateStr || '') + '_' + filename,
          parents: [typeId]
        },
        media: { mimeType: mime, body: fs.createReadStream(filePath) },
        fields: 'id,webViewLink'
      });

      return {
        uploaded: true,
        fileId:   res.data.id,
        driveUrl: res.data.webViewLink,
        state:    src.state,
        type:     getTypeFolder(src.type)
      };
    } catch(e) {
      console.error('[drive-uploader] upload error: ' + e.message);
      return { skipped: true, reason: e.message };
    }
  }

  isEnabled() { return this._enabled; }
}

module.exports = DriveUploader;
