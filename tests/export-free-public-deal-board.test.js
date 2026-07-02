'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'dotenv') return { config: () => ({ parsed: {} }) };
  if (request === 'pdf-parse') return async (buffer) => ({ text: Buffer.from(buffer).toString('utf8') });
  return originalLoad.call(this, request, parent, isMain);
};

const exporter = require('../scripts/export-free-public-deal-board');

(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wholesaleos-export-'));
  const dbPath = path.join(tmpDir, 'db.json');
  process.env.DB_PATH = dbPath;
  fs.writeFileSync(dbPath, JSON.stringify({ leads: [] }, null, 2));

  // Arg parsing.
  const parsed = exporter.parseExportArgs(['--city', 'Dallas', '--county', 'Dallas', '--state', 'tx', '--limit', '10', '--no-lookup', '--out-dir', tmpDir]);
  assert.strictEqual(parsed.input.market.state, 'TX');
  assert.strictEqual(parsed.input.limit, 10);
  assert.strictEqual(parsed.input.enable_official_browser_lookup, false);
  assert.strictEqual(parsed.options.out_dir, tmpDir);

  // CSV escaping.
  assert.strictEqual(exporter.csvEscape('plain'), 'plain');
  assert.strictEqual(exporter.csvEscape('a,b'), '"a,b"');
  assert.strictEqual(exporter.csvEscape('say "hi"\nnext'), '"say ""hi""\nnext"');

  const mockResult = {
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    browser_runtime_available: true,
    free_public_deals: [
      {
        headline: '3723 Barnabus Rd, Dallas, TX 75241',
        normalized_address: '3723 Barnabus Rd, Dallas, TX 75241',
        city: 'Dallas',
        state: 'TX',
        quality_bucket: 'INSPECT_NOW',
        owner_record: { owner_name: 'KILLER CAPITAL CONSULTANTS LLC', is_entity: true },
        official_lookup_status: 'OWNER_CLUE_ONLY',
        source_document_url: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf',
        best_link_to_click_first: 'https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf',
        maps_url: 'https://www.google.com/maps/search/?api=1&query=3723',
        zillow_url: '',
        free_contact_status: 'CALL_READY',
        free_contact_routes: [{ value: '(888) 313-1969', route_type: 'trustee_servicer_or_official' }],
        appraisal_clues: [{ value: '$153,440' }],
        call_prep: {
          contact_status: 'VISIBLE_PUBLIC_CONTACT',
          ARV_lock_state: 'ARV_LOCKED_NO_VERIFIED_COMPS',
          MAO_lock_state: 'MAO_LOCKED_NO_ARV',
          seller_questions: ['Am I speaking with the owner of 3723 Barnabus Rd, Dallas, TX 75241?', 'Has a sale date, been set?']
        },
        MAO_lock_state: 'MAO_LOCKED_NO_ARV',
        next_best_action: 'RUN_COMP_RESEARCH',
        missing_fields: ['3 verified sold comps'],
        blocked_sources: [{ source: 'public_sold_page', reason: 'http_403' }],
        browser_blocked_sources: [{ source: 'dcad_account_detail_page', reason: 'detail_page_blocked_http_403' }]
      },
      // duplicate of the same address WITHOUT the document link - must dedupe away
      {
        headline: 'Dallas County Clerk Foreclosure Notices',
        normalized_address: '3723 Barnabus Rd, Dallas, TX 75241',
        city: 'Dallas',
        state: 'TX',
        quality_bucket: 'INSPECT_NOW',
        source_document_url: '',
        best_link_to_click_first: 'https://example.gov',
        call_prep: { seller_questions: [] },
        missing_fields: []
      },
      {
        headline: 'Dallas County Clerk Foreclosure Notices - source proof 1',
        normalized_address: '',
        quality_bucket: 'SOURCE_PROOF_ONLY',
        best_link_to_click_first: 'https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php',
        next_best_action: 'VERIFY_PROPERTY_IDENTITY',
        call_prep: { seller_questions: [] },
        missing_fields: ['complete property address']
      }
    ]
  };

  const out = await exporter.runExport({
    market: { city: 'Dallas', county: 'Dallas', state: 'TX' },
    limit: 25,
    enable_official_browser_lookup: false
  }, {
    out_dir: tmpDir,
    board_impl: async () => mockResult
  });

  // Files written to the temp dir only.
  for (const key of ['json', 'csv', 'markdown']) {
    assert.ok(out.paths[key].startsWith(tmpDir), `${key} path must be in temp dir`);
    assert.ok(fs.existsSync(out.paths[key]), `${key} file must exist`);
  }

  // Dedupe: the address appears once, keeping the row with the PDF link.
  const addressRows = out.rows.filter((row) => row.address);
  assert.strictEqual(addressRows.length, 1);
  assert.ok(/May\/Dallas_1\.pdf/.test(addressRows[0].source_document_url));
  assert.strictEqual(addressRows[0].owner_record, 'KILLER CAPITAL CONSULTANTS LLC [entity]');
  assert.strictEqual(addressRows[0].contact_status, 'CALL_READY');
  assert.ok(/appraisal clue only - not ARV/.test(addressRows[0].appraised_value));
  assert.strictEqual(addressRows[0].arv_lock, 'ARV_LOCKED_NO_VERIFIED_COMPS');
  assert.strictEqual(addressRows[0].mao_lock, 'MAO_LOCKED_NO_ARV');

  // CSV: header exact, comma-containing fields quoted, parse row count correct.
  const csv = fs.readFileSync(out.paths.csv, 'utf8');
  const csvLines = csv.trim().split(/\r\n/);
  assert.strictEqual(csvLines[0], exporter.CSV_COLUMNS.join(','));
  assert.strictEqual(csvLines.length, 1 + out.rows.length);
  assert.ok(csv.includes('"3723 Barnabus Rd, Dallas, TX 75241"'));
  assert.ok(csv.includes('"Am I speaking with the owner of 3723 Barnabus Rd, Dallas, TX 75241? | Has a sale date, been set?"'));

  // Markdown: links, questions, locks, blocked sources present.
  const markdown = fs.readFileSync(out.paths.markdown, 'utf8');
  assert.ok(markdown.includes('[Notice PDF](https://www.dallascounty.org/department/countyclerk/media/foreclosure/May/Dallas_1.pdf)'));
  assert.ok(markdown.includes('[Maps](https://www.google.com/maps/search/?api=1&query=3723)'));
  assert.ok(markdown.includes('Am I speaking with the owner of 3723 Barnabus Rd'));
  assert.ok(markdown.includes('ARV ARV_LOCKED_NO_VERIFIED_COMPS / MAO MAO_LOCKED_NO_ARV'));
  assert.ok(markdown.includes('KILLER CAPITAL CONSULTANTS LLC [entity]'));
  assert.ok(markdown.includes('detail_page_blocked_http_403'));
  assert.ok(markdown.includes('appraisal clue only - not ARV'));
  assert.ok(markdown.includes('preview only, no data saved'));

  // JSON parses and is preview-only.
  const json = JSON.parse(fs.readFileSync(out.paths.json, 'utf8'));
  assert.strictEqual(json.preview_only, true);
  assert.strictEqual(json.rows.length, out.rows.length);

  // Summary counts.
  assert.strictEqual(out.summary.address_rows, 1);
  assert.strictEqual(out.summary.call_ready, 1);
  assert.strictEqual(out.summary.owner_records, 1);

  // No DB mutation.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(dbPath, 'utf8')).leads, []);

  // Repo exports dir is git-ignored (no committed artifacts).
  const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');
  assert.ok(/^exports\/$/m.test(gitignore));

  console.log('export free public deal board tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
