/**
 * ═══════════════════════════════════════════════════════════════
 *  WholesaleOS — Courthouse Lead Automation Add-on
 *  ISOLATED MODULE — does NOT modify any existing bot logic
 * ═══════════════════════════════════════════════════════════════
 *
 *  Reads mastersheet.csv → Playwright automation → parses files
 *  → formats leads → sends to existing ingestion pipeline
 *
 *  Run standalone:  node courthouse-runner.js
 *  Scheduled:       auto-runs daily via node-cron
 */

'use strict';

const cron        = require('node-cron');
const path        = require('path');
const fs          = require('fs');
const { parse }   = require('csv-parse/sync');
const { v4: uuid} = require('uuid');

const CourthouseScraper  = require('./scraper');
const FileParser         = require('./file-parser');
const DriveUploader      = require('./drive-uploader');
const LeadFormatter      = require('./lead-formatter');
const CourthouseDB        = require('./courthouse-db');

// ── Config ──────────────────────────────────────────────────────
const CONFIG = {
  csv:           path.join(__dirname, 'mastersheet.csv'),
  downloadDir:   path.join(__dirname, 'downloads'),
  processedDir:  path.join(__dirname, 'processed'),
  dbFile:        path.join(__dirname, 'courthouse-leads.json'),
  daysFilter:    7,           // fetch records from last N days
  concurrency:   3,           // parallel browser sessions
  headless:      true,
  cronSchedule:  '0 2 * * *', // 2 AM daily
  useDrive:      !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
};

// Ensure directories exist
[CONFIG.downloadDir, CONFIG.processedDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Source CSV loader ────────────────────────────────────────────
function loadSources() {
  const raw = fs.readFileSync(CONFIG.csv, 'utf8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  return rows
    .filter(r => r.States && (r.URL || r.Link) && (r.URL || r.Link).startsWith('http'))
    .map(r => ({
      state:   r.States.trim(),
      market:  r.Market.trim(),
      type:    r.Type.trim(),
      url:     (r.URL || r.Link).trim(),
    }));
}

// ── Priority ranking (module-local only, does NOT touch main bot) ─
function priorityScore(lead) {
  const flags = lead.priority_flags || [];
  if (flags.includes('foreclosure') && lead.auction_date) {
    const days = Math.ceil((new Date(lead.auction_date) - Date.now()) / 86400000);
    if (days <= 14) return 100; // expiring foreclosure — highest
  }
  if (flags.includes('high_equity'))     return 80;
  if (flags.includes('vacant'))          return 70;
  if (flags.includes('code_violation'))  return 60;
  if (flags.includes('probate'))         return 50;
  return 30;
}

// ── Main runner ──────────────────────────────────────────────────
async function runCourthouseAutomation(options = {}) {
  const startTime = Date.now();
  console.log(`\n[${ new Date().toISOString() }] Courthouse Automation starting...`);

  const sources  = loadSources();
  const db       = new CourthouseDB(CONFIG.dbFile);
  const scraper  = new CourthouseScraper({ headless: CONFIG.headless, downloadDir: CONFIG.downloadDir });
  const parser   = new FileParser();
  const uploader = new DriveUploader();
  const formatter= new LeadFormatter();

  console.log(`Loaded ${sources.length} sources across ${[...new Set(sources.map(s=>s.state))].length} states`);

  // Filter to specific states if passed as arg
  const targetStates = options.states || null;
  const activeSources = targetStates
    ? sources.filter(s => targetStates.includes(s.state))
    : sources;

  const allNewLeads = [];
  let downloaded = 0, parsed = 0, skipped = 0;

  // Process in batches of CONFIG.concurrency
  for (let i = 0; i < activeSources.length; i += CONFIG.concurrency) {
    const batch = activeSources.slice(i, i + CONFIG.concurrency);
    const results = await Promise.allSettled(
      batch.map(src => processSingleSource(src, scraper, parser, uploader, formatter, db, CONFIG))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const src = batch[j];
      if (r.status === 'fulfilled' && r.value) {
        const { leads, files } = r.value;
        downloaded += files;
        parsed     += leads.length;
        allNewLeads.push(...leads);
        if (leads.length) console.log(`  ✓ ${src.market} [${src.type}] → ${leads.length} leads`);
        else console.log(`  - ${src.market} [${src.type}] → 0 new leads`);
      } else {
        skipped++;
        console.log(`  ✗ ${src.market} [${src.type}] → ${r.reason?.message || 'failed'}`);
      }
    }
  }

  await scraper.close();

  // Deduplicate by address
  const uniqueLeads = deduplicateLeads(allNewLeads, db);
  console.log(`\nDeduplication: ${allNewLeads.length} raw → ${uniqueLeads.length} unique new`);

  // Sort by priority (module-local ranking only)
  uniqueLeads.sort((a, b) => priorityScore(b) - priorityScore(a));

  // Save to courthouse DB
  db.appendLeads(uniqueLeads);

  // Send to existing WholesaleOS ingestion pipeline
  if (uniqueLeads.length > 0) {
    await sendToExistingPipeline(uniqueLeads);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const summary = {
    timestamp:    new Date().toISOString(),
    sources:      activeSources.length,
    filesDownloaded: downloaded,
    leadsFound:   parsed,
    newLeads:     uniqueLeads.length,
    skipped,
    elapsed:      `${elapsed}s`,
  };

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Courthouse run complete in ${elapsed}s`);
  console.log(`  Sources: ${activeSources.length} | Files: ${downloaded} | Leads: ${parsed} | New: ${uniqueLeads.length}`);
  console.log(`${'─'.repeat(50)}\n`);

  return { summary, leads: uniqueLeads };
}

// ── Process one source ───────────────────────────────────────────
async function processSingleSource(src, scraper, parser, uploader, formatter, db, config) {
  const today    = new Date();
  const dateStr  = today.toISOString().slice(0, 10);
  const stateDir = path.join(config.downloadDir, src.state, src.market.replace(/[^a-z0-9]/gi, '_'), dateStr);
  fs.mkdirSync(stateDir, { recursive: true });

  // Browser automation
  const downloadedFiles = await scraper.scrapeSource(src, stateDir, config.daysFilter);

  let allLeads = [];

  for (const filePath of downloadedFiles) {
    try {
      const raw = await parser.parse(filePath, src);
      const leads = raw.map(record => formatter.format(record, src));
      allLeads.push(...leads);

      // Upload to Google Drive
      if (config.useDrive && filePath) {
        await uploader.upload(filePath, src, dateStr).catch(() => {});
      }
    } catch (e) {
      console.log(`    Parse error ${path.basename(filePath)}: ${e.message}`);
    }
  }

  return { leads: allLeads, files: downloadedFiles.length };
}

// ── Deduplication ────────────────────────────────────────────────
function deduplicateLeads(leads, db) {
  const existing = db.getAddressSet();
  return leads.filter(l => {
    const key = normalizeAddress(l.address);
    if (!key || existing.has(key)) return false;
    existing.add(key);
    return true;
  });
}

function normalizeAddress(addr) {
  if (!addr) return null;
  return addr.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Send to existing WholesaleOS pipeline ────────────────────────
async function sendToExistingPipeline(leads) {
  const BASE_URL = process.env.WHOLESALEOS_API || ('http://localhost:' + (process.env.PORT || 8080));
  const axios = require('axios');

  console.log(`\nSending ${leads.length} leads to WholesaleOS pipeline...`);
  let sent = 0, failed = 0;

  // Batch POST to existing /api/leads endpoint
  for (const lead of leads) {
    try {
      await axios.post(`${BASE_URL}/api/leads`, lead, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json', 'x-source': 'courthouse-addon' }
      });
      sent++;
    } catch (e) {
      // Fallback: write to pending file for manual import
      failed++;
    }
  }

  // Write any failures to pending file
  if (failed > 0) {
    const pendingFile = path.join(__dirname, 'processed', `pending-${Date.now()}.json`);
    const failedLeads = leads.slice(sent);
    fs.writeFileSync(pendingFile, JSON.stringify(failedLeads, null, 2));
    console.log(`  ${sent} sent, ${failed} written to ${path.basename(pendingFile)}`);
  } else {
    console.log(`  All ${sent} leads sent successfully`);
  }
}

// ── Scheduler ───────────────────────────────────────────────────
function startScheduler() {
  console.log(`Courthouse automation scheduled: ${CONFIG.cronSchedule} (daily at 2 AM)`);
  cron.schedule(CONFIG.cronSchedule, () => {
    runCourthouseAutomation().catch(err => {
      console.error('Scheduled run failed:', err.message);
    });
  });
}

// ── Entry point ──────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const states = args.filter(a => a.length === 2 && a === a.toUpperCase());

  if (isTest) {
    // Test mode: run just 2 sources
    console.log('TEST MODE: running first 2 sources only');
    const sources = loadSources().slice(0, 2);
    runCourthouseAutomation({ states: sources.map(s => s.state) })
      .then(r => console.log('Test complete:', r.summary))
      .catch(console.error);
  } else if (args.includes('--schedule')) {
    startScheduler();
    // Also run immediately on start
    runCourthouseAutomation({ states: states.length ? states : null })
      .catch(console.error);
  } else {
    runCourthouseAutomation({ states: states.length ? states : null })
      .then(r => { console.log('Done:', r.summary); process.exit(0); })
      .catch(err => { console.error(err); process.exit(1); });
  }
}

module.exports = { runCourthouseAutomation, startScheduler, priorityScore };
