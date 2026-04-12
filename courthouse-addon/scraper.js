/**
 * CourthouseScraper — Playwright browser automation
 * Handles all source types: Accela, Tyler, ArcGIS, Open Data, custom portals
 * Simulates human browsing with realistic timing and interactions
 */

'use strict';

const { chromium } = require('playwright');
const path = require('path');
const fs   = require('fs');

// Source type detection patterns
const SOURCE_PATTERNS = {
  accela:   /accela\.com|citizenaccess|energov/i,
  tyler:    /tylertech|tylerpaw|publicaccess|tylerprod/i,
  arcgis:   /arcgis\.com|hub\.arcgis|opendata\.arcgis/i,
  acclaim:  /acclaimweb|acclaim\./i,
  opendata: /data\.[a-z]+\.gov|opendata|opendataphilly|datanashville/i,
  massCourts: /masscourts|wcca\.wicourts|kscourts/i,
  landrecords: /landrecords|pimacountyaz-web|isol\.alachuaclerk/i,
  probate:  /probate|estates|eaccess\.lucas|masscourts/i,
  taxdelinq: /revenue\.nebraska|delinquent|treasurer/i,
};

class CourthouseScraper {
  constructor(options = {}) {
    this.headless    = options.headless !== false;
    this.downloadDir = options.downloadDir || './downloads';
    this.browser     = null;
    this.contexts    = [];
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
      });
    }
    return this.browser;
  }

  async getPage(downloadPath) {
    await this.init();
    const ctx = await this.browser.newContext({
      acceptDownloads: true,
      viewport: { width: 1366, height: 768 },
      locale: 'en-US',
      timezoneId: 'America/New_York',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }
    });
    this.contexts.push(ctx);
    const page = await ctx.newPage();

    // Mask automation signals
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      window.chrome = { runtime: {} };
    });

    page.setDefaultTimeout(30000);
    return { page, ctx, downloadPath };
  }

  // ── Main entry point ────────────────────────────────────────────
  async scrapeSource(src, downloadPath, daysFilter = 7) {
    const sourceType = this.detectSourceType(src.url);
    console.log(`  Scraping [${sourceType}] ${src.market}...`);

    try {
      switch (sourceType) {
        case 'accela':     return await this.scrapeAccela(src, downloadPath, daysFilter);
        case 'tyler':      return await this.scrapeTyler(src, downloadPath, daysFilter);
        case 'arcgis':     return await this.scrapeArcGIS(src, downloadPath, daysFilter);
        case 'acclaim':    return await this.scrapeAcclaim(src, downloadPath, daysFilter);
        case 'opendata':   return await this.scrapeOpenData(src, downloadPath, daysFilter);
        case 'massCourts': return await this.scrapeMassCourts(src, downloadPath, daysFilter);
        case 'landrecords':return await this.scrapeLandRecords(src, downloadPath, daysFilter);
        case 'taxdelinq':  return await this.scrapeTaxDelinquent(src, downloadPath, daysFilter);
        default:           return await this.scrapeGeneric(src, downloadPath, daysFilter);
      }
    } catch (err) {
      console.log(`    Error: ${err.message}`);
      return [];
    }
  }

  detectSourceType(url) {
    for (const [type, pattern] of Object.entries(SOURCE_PATTERNS)) {
      if (pattern.test(url)) return type;
    }
    return 'generic';
  }

  // ── Human-like helpers ───────────────────────────────────────────
  async humanDelay(min = 800, max = 2000) {
    const ms = Math.floor(Math.random() * (max - min) + min);
    await new Promise(r => setTimeout(r, ms));
  }

  async humanType(page, selector, text) {
    await page.click(selector);
    await this.humanDelay(200, 500);
    await page.keyboard.type(text, { delay: Math.floor(Math.random() * 80 + 40) });
  }

  async waitAndClick(page, selector, options = {}) {
    await page.waitForSelector(selector, { timeout: 15000, ...options });
    await this.humanDelay(400, 900);
    await page.click(selector);
  }

  dateRange(daysBack) {
    const end   = new Date();
    const start = new Date(Date.now() - daysBack * 86400000);
    const fmt   = d => `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
    return { start: fmt(start), end: fmt(end), startDate: start, endDate: end };
  }

  async saveDownload(download, downloadPath) {
    const fileName = download.suggestedFilename() || `download-${Date.now()}`;
    const filePath = path.join(downloadPath, fileName);
    await download.saveAs(filePath);
    return filePath;
  }

  // ── Accela Civic Platform (many cities) ─────────────────────────
  async scrapeAccela(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(1500, 2500);

      // Handle disclaimer/login pages
      const disclaimerBtn = await page.$('button:has-text("Continue"), button:has-text("I Agree"), a:has-text("Continue")');
      if (disclaimerBtn) {
        await this.humanDelay(800, 1200);
        await disclaimerBtn.click();
        await page.waitForLoadState('domcontentloaded');
      }

      // Navigate to enforcement/violations tab if needed
      const enfTab = await page.$('a:has-text("Enforcement"), a:has-text("Code"), li[id*="Enforcement"]');
      if (enfTab) {
        await this.humanDelay(600, 1000);
        await enfTab.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1000, 1500);
      }

      // Click "Search" button to open search form
      const searchBtn = await page.$('a:has-text("Search"), button:has-text("Search"), #ctl00_PlaceHolderMain_btnNewSearch');
      if (searchBtn) {
        await this.humanDelay(400, 700);
        await searchBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1200, 1800);
      }

      // Set date filter — "Filed Date From"
      const { start, end } = this.dateRange(daysFilter);
      const dateFromField = await page.$('#ctl00_PlaceHolderMain_txtDateFrom, input[id*="DateFrom"], input[name*="DateFrom"]');
      if (dateFromField) {
        await dateFromField.fill(start);
        await this.humanDelay(300, 600);
      }
      const dateToField = await page.$('#ctl00_PlaceHolderMain_txtDateTo, input[id*="DateTo"], input[name*="DateTo"]');
      if (dateToField) {
        await dateToField.fill(end);
        await this.humanDelay(300, 600);
      }

      // Submit search
      const submitBtn = await page.$('#ctl00_PlaceHolderMain_btnSearch, button[type="submit"], input[type="submit"]');
      if (submitBtn) {
        await this.humanDelay(500, 900);
        await submitBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(2000, 3000);
      }

      // Extract results table
      const results = await this.extractAccelaTable(page);
      if (results.length > 0) {
        const csvPath = path.join(downloadPath, `accela-${Date.now()}.json`);
        fs.writeFileSync(csvPath, JSON.stringify(results));
        files.push(csvPath);
      }

      // Try download button
      const downloadBtn = await page.$('button:has-text("Export"), a:has-text("CSV"), button:has-text("Download")');
      if (downloadBtn) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
          downloadBtn.click()
        ]);
        if (download) {
          const fp = await this.saveDownload(download, downloadPath);
          files.push(fp);
        }
      }

      // Handle pagination
      let pageNum = 1;
      while (pageNum < 10) {
        const nextBtn = await page.$('a:has-text("Next"), button:has-text("Next >"), a[title="Next Page"]');
        if (!nextBtn) break;
        const isDisabled = await nextBtn.evaluate(el => el.classList.contains('disabled') || el.getAttribute('disabled'));
        if (isDisabled) break;
        await this.humanDelay(800, 1400);
        await nextBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1500, 2500);
        const moreResults = await this.extractAccelaTable(page);
        if (moreResults.length > 0) {
          const fp = path.join(downloadPath, `accela-page${pageNum+1}-${Date.now()}.json`);
          fs.writeFileSync(fp, JSON.stringify(moreResults));
          files.push(fp);
        }
        pageNum++;
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  async extractAccelaTable(page) {
    return await page.$$eval(
      'table.ACA_Grid_OverFlow tr, #ctl00_PlaceHolderMain_dgvPermitList tr, .tableContent tr',
      rows => rows.slice(1).map(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
        return cells.length >= 3 ? {
          caseNumber: cells[0] || '',
          address:    cells[1] || '',
          type:       cells[2] || '',
          status:     cells[3] || '',
          date:       cells[4] || '',
          raw:        cells
        } : null;
      }).filter(Boolean)
    ).catch(() => []);
  }

  // ── Tyler Technologies portals ───────────────────────────────────
  async scrapeTyler(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // Tyler portals often need search type selection
      const searchTypeEl = await page.$('select#selSearchType, select[name="caseType"]');
      if (searchTypeEl) {
        // Select relevant case type based on lead type
        const typeVal = this.getTylerCaseType(src.type);
        await searchTypeEl.selectOption({ label: typeVal }).catch(() => {});
        await this.humanDelay(500, 900);
      }

      // Set date range
      const { start, end } = this.dateRange(daysFilter);
      const filedFrom = await page.$('input#dateFiled_from, input[name="filedDateFrom"], input[placeholder*="From"]');
      if (filedFrom) await filedFrom.fill(start);
      const filedTo = await page.$('input#dateFiled_to, input[name="filedDateTo"], input[placeholder*="To"]');
      if (filedTo) await filedTo.fill(end);

      await this.humanDelay(400, 700);

      // Search
      const searchBtn = await page.$('button:has-text("Search"), input[value="Search"]');
      if (searchBtn) {
        await searchBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(2000, 3500);
      }

      // Extract results
      const results = await page.$$eval(
        'table.results tr, #caseSearchResults tr, .searchResults tr',
        rows => rows.slice(1).map(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          return cells.length >= 2 ? { raw: cells, caseNumber: cells[0], address: cells[1] } : null;
        }).filter(Boolean)
      ).catch(() => []);

      if (results.length) {
        const fp = path.join(downloadPath, `tyler-${Date.now()}.json`);
        fs.writeFileSync(fp, JSON.stringify(results));
        files.push(fp);
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  getTylerCaseType(leadType) {
    const t = leadType.toLowerCase();
    if (t.includes('probate')) return 'Probate';
    if (t.includes('foreclosure')) return 'Foreclosure';
    if (t.includes('lien')) return 'Lien';
    if (t.includes('bankruptcy')) return 'Bankruptcy';
    return 'All';
  }

  // ── ArcGIS Open Data portals ─────────────────────────────────────
  async scrapeArcGIS(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'networkidle', timeout: 35000 });
      await this.humanDelay(3000, 5000);

      // ArcGIS Hub — look for download button
      const downloadBtn = await page.$(
        'button[aria-label*="Download"], a:has-text("Download"), calcite-button:has-text("Download"), button.download'
      );

      if (downloadBtn) {
        await this.humanDelay(800, 1200);
        await downloadBtn.click();
        await this.humanDelay(1500, 2500);

        // Select CSV format
        const csvOpt = await page.$('a:has-text("CSV"), button:has-text("CSV"), li:has-text("Spreadsheet (CSV)")');
        if (csvOpt) {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
            csvOpt.click()
          ]);
          if (download) {
            const fp = await this.saveDownload(download, downloadPath);
            files.push(fp);
          }
        }
      } else {
        // Try the ArcGIS API directly for datasets
        const datasetId = src.url.match(/datasets\/([\w]+)/)?.[1];
        if (datasetId) {
          const apiUrl = `https://opendata.arcgis.com/datasets/${datasetId}.csv`;
          const fp = await this.downloadViaPage(page, apiUrl, downloadPath);
          if (fp) files.push(fp);
        }
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  // ── Acclaim Web (county recorder portals) ───────────────────────
  async scrapeAcclaim(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // Bypass disclaimer
      const continueBtn = await page.$('button:has-text("Continue"), input[value="I Agree"], a:has-text("I agree")');
      if (continueBtn) {
        await continueBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1500, 2000);
      }

      // Document type search
      const docTypeSearch = await page.$('a:has-text("Document Type"), button:has-text("Document Type")');
      if (docTypeSearch) {
        await docTypeSearch.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(1000, 1500);
      }

      // Select document types relevant to lead type
      const { start, end } = this.dateRange(daysFilter);

      // Date range fields
      const startField = await page.$('input[name*="startDate"], input[id*="startDate"], input[placeholder*="Start Date"]');
      if (startField) await startField.fill(start);
      const endField = await page.$('input[name*="endDate"], input[id*="endDate"], input[placeholder*="End Date"]');
      if (endField) await endField.fill(end);

      await this.humanDelay(500, 900);

      // Select doc type based on lead type
      const docTypes = this.getAcclaimDocTypes(src.type);
      for (const dt of docTypes) {
        const opt = await page.$(`option:has-text("${dt}"), label:has-text("${dt}")`);
        if (opt) await opt.click().catch(() => {});
      }

      // Search
      const searchBtn = await page.$('button:has-text("Search"), input[type="submit"]');
      if (searchBtn) {
        await searchBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(3000, 4500);
      }

      // Extract results
      const results = await page.$$eval(
        'table.resultsTable tr, #searchResultsTable tr, .dataTable tr',
        rows => rows.slice(1).map(row => {
          const cells = Array.from(row.querySelectorAll('td')).map(c => c.innerText.trim());
          return cells.length >= 3 ? {
            docNumber: cells[0], name: cells[1], type: cells[2],
            date: cells[3], book: cells[4], page: cells[5], raw: cells
          } : null;
        }).filter(Boolean)
      ).catch(() => []);

      if (results.length) {
        const fp = path.join(downloadPath, `acclaim-${Date.now()}.json`);
        fs.writeFileSync(fp, JSON.stringify(results));
        files.push(fp);
      }

      // Export/download button
      const exportBtn = await page.$('button:has-text("Export"), a:has-text("Export to CSV")');
      if (exportBtn) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
          exportBtn.click()
        ]);
        if (download) files.push(await this.saveDownload(download, downloadPath));
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  getAcclaimDocTypes(leadType) {
    const t = leadType.toLowerCase();
    if (t.includes('lien'))        return ['LIS PENDENS', 'LIEN', 'TAX LIEN', 'MECHANICS LIEN'];
    if (t.includes('probate'))     return ['LETTERS TESTAMENTARY', 'PROBATE', 'ESTATE'];
    if (t.includes('foreclosure')) return ['LIS PENDENS', 'NOTICE OF DEFAULT', 'FORECLOSURE'];
    if (t.includes('bankruptcy'))  return ['BANKRUPTCY'];
    if (t.includes('divorce'))     return ['DIVORCE', 'DISSOLUTION'];
    return ['LIS PENDENS', 'LIEN', 'PROBATE'];
  }

  // ── Government Open Data portals ─────────────────────────────────
  async scrapeOpenData(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'networkidle', timeout: 35000 });
      await this.humanDelay(2000, 3000);

      // Socrata / data.gov portals
      if (src.url.includes('data.') || src.url.includes('opendata')) {
        // Look for export/download options
        const exportBtn = await page.$(
          'a:has-text("Export"), button:has-text("Export"), .exportDropdownButton, a[aria-label*="Download"]'
        );

        if (exportBtn) {
          await this.humanDelay(600, 1000);
          await exportBtn.click();
          await this.humanDelay(1000, 1500);

          // Select CSV
          const csvLink = await page.$('a:has-text("CSV"), a:has-text(".csv"), button:has-text("CSV")');
          if (csvLink) {
            const [download] = await Promise.all([
              page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
              csvLink.click()
            ]);
            if (download) files.push(await this.saveDownload(download, downloadPath));
          }
        } else {
          // Try direct API endpoint
          const apiUrl = this.buildSocrataApiUrl(src.url, daysFilter);
          if (apiUrl) {
            const fp = await this.downloadViaPage(page, apiUrl, downloadPath);
            if (fp) files.push(fp);
          }
        }
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  buildSocrataApiUrl(url, daysFilter) {
    // Convert Socrata portal URL to API URL with date filter
    const match = url.match(/data\.[^/]+\/[^/]+\/([A-Za-z0-9-]+)/);
    if (!match) return null;
    const startDate = new Date(Date.now() - daysFilter * 86400000).toISOString().slice(0, 10);
    const base = url.split('/about_data')[0].replace('/explore', '');
    return `${base}.csv?$where=date_filed >= '${startDate}'&$limit=1000`;
  }

  // ── Mass Courts / WI Courts / KS Courts ─────────────────────────
  async scrapeMassCourts(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      const { start, end } = this.dateRange(daysFilter);

      // Date range search
      const fromInput = await page.$('input[id*="startDate"], input[name*="start"], input[placeholder*="From"]');
      if (fromInput) await fromInput.fill(start);
      const toInput = await page.$('input[id*="endDate"], input[name*="end"], input[placeholder*="To"]');
      if (toInput) await toInput.fill(end);

      // Case type
      const caseTypeField = await page.$('select[id*="caseType"], select[name*="caseType"]');
      if (caseTypeField) {
        if (src.type.toLowerCase().includes('probate')) {
          await caseTypeField.selectOption({ label: /probate/i }).catch(() => {});
        }
      }

      await this.humanDelay(500, 900);

      const searchBtn = await page.$('button[type="submit"], input[type="submit"], button:has-text("Search")');
      if (searchBtn) {
        await searchBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(3000, 5000);
      }

      // Extract results rows
      const results = await this.extractGenericTable(page);
      if (results.length) {
        const fp = path.join(downloadPath, `courts-${Date.now()}.json`);
        fs.writeFileSync(fp, JSON.stringify(results));
        files.push(fp);
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  // ── Land Records portals ──────────────────────────────────────────
  async scrapeLandRecords(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // Handle any CAPTCHA notice (bail if present)
      const captcha = await page.$('iframe[src*="recaptcha"], .g-recaptcha');
      if (captcha) {
        console.log('    CAPTCHA detected — skipping automated access');
        return files;
      }

      const { start, end } = this.dateRange(daysFilter);

      // Date range
      const startEl = await page.$('input[name*="start"], input[id*="start_date"], input[placeholder*="MM/DD"]');
      if (startEl) await startEl.fill(start);
      const endEl = await page.$('input[name*="end"], input[id*="end_date"]');
      if (endEl) await endEl.fill(end);

      // Instrument/doc type selector
      const instrEl = await page.$('select[name*="instrument"], select[id*="docType"]');
      if (instrEl) {
        const docTypes = this.getAcclaimDocTypes(src.type);
        await instrEl.selectOption(docTypes[0]).catch(() => {});
      }

      await this.humanDelay(600, 1000);

      const searchBtn = await page.$('button[type="submit"], input[value="Search"], button:has-text("Search")');
      if (searchBtn) {
        await searchBtn.click();
        await page.waitForLoadState('domcontentloaded');
        await this.humanDelay(3000, 4500);
      }

      const results = await this.extractGenericTable(page);
      if (results.length) {
        const fp = path.join(downloadPath, `landrecords-${Date.now()}.json`);
        fs.writeFileSync(fp, JSON.stringify(results));
        files.push(fp);
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  // ── Tax Delinquent lists ─────────────────────────────────────────
  async scrapeTaxDelinquent(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // Look for direct download links
      const links = await page.$$eval(
        'a[href$=".csv"], a[href$=".xlsx"], a[href$=".pdf"], a:has-text("Download"), a:has-text("List")',
        els => els.map(el => ({ href: el.href, text: el.innerText.trim() }))
      );

      for (const link of links.slice(0, 5)) {
        if (link.href && link.href.match(/\.(csv|xlsx|pdf)$/i)) {
          const fp = await this.downloadViaPage(page, link.href, downloadPath);
          if (fp) files.push(fp);
          await this.humanDelay(800, 1200);
        }
      }

      if (!files.length) {
        const results = await this.extractGenericTable(page);
        if (results.length) {
          const fp = path.join(downloadPath, `taxdelinq-${Date.now()}.json`);
          fs.writeFileSync(fp, JSON.stringify(results));
          files.push(fp);
        }
      }
    } finally {
      await ctx.close();
    }
    return files;
  }

  // ── Generic fallback ─────────────────────────────────────────────
  async scrapeGeneric(src, downloadPath, daysFilter) {
    const { page, ctx } = await this.getPage(downloadPath);
    const files = [];

    try {
      await page.goto(src.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.humanDelay(2000, 3000);

      // Try downloading any CSV/Excel/PDF files linked on the page
      const downloadLinks = await page.$$eval(
        'a[href$=".csv"], a[href$=".xlsx"], a[href$=".xls"], a[href$=".pdf"]',
        els => els.map(el => el.href).filter(Boolean)
      ).catch(() => []);

      for (const url of downloadLinks.slice(0, 5)) {
        const fp = await this.downloadViaPage(page, url, downloadPath);
        if (fp) files.push(fp);
        await this.humanDelay(500, 1000);
      }

      // If no downloads, extract visible table data
      if (!files.length) {
        const results = await this.extractGenericTable(page);
        if (results.length) {
          const fp = path.join(downloadPath, `generic-${Date.now()}.json`);
          fs.writeFileSync(fp, JSON.stringify(results));
          files.push(fp);
        }
      }
    } catch (err) {
      console.log(`    Generic scrape error: ${err.message}`);
    } finally {
      await ctx.close();
    }
    return files;
  }

  // ── Shared helpers ───────────────────────────────────────────────
  async extractGenericTable(page) {
    return await page.$$eval('table tr', rows =>
      rows.slice(1).map(row => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(c => c.innerText.trim());
        return cells.length >= 2 ? { raw: cells } : null;
      }).filter(Boolean)
    ).catch(() => []);
  }

  async downloadViaPage(page, url, downloadPath) {
    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        page.goto(url, { waitUntil: 'commit' })
      ]);
      return await this.saveDownload(download, downloadPath);
    } catch {
      // Some files open inline rather than triggering download
      try {
        const content = await page.content();
        if (content.length > 100) {
          const ext = url.match(/\.(csv|xlsx|pdf)$/i)?.[1] || 'html';
          const fp = path.join(downloadPath, `downloaded-${Date.now()}.${ext}`);
          fs.writeFileSync(fp, content);
          return fp;
        }
      } catch {}
      return null;
    }
  }

  async close() {
    for (const ctx of this.contexts) {
      await ctx.close().catch(() => {});
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

module.exports = CourthouseScraper;
