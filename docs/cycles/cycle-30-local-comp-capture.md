# Cycle 30: Local Comp Capture

## What this adds

The dashboard can already accept screenshots, ask its existing OCR reader to propose fields, and keep each proposal separate until Gabriel confirms it. Cycle 30 adds a small command-line helper that runs on the operator's Windows computer. It opens a visible local Chromium window, reads public Zillow, Redfin, or Realtor pages, takes small screenshots of matching sold-result cards, and uploads those images to the existing manual-evidence upload endpoint.

The web server does not receive a browser session and the Cycle 30 helper is not installed or launched by the server. The helper uses the current public pages only. A CAPTCHA, sign-in wall, subscription wall, HTTP 403/429, unknown page layout, or redirect to a different host stops that run. It does not solve challenges, sign in, or retry around a block.

The helper opens its own temporary visible browser window. It does not attach to an already-open Chrome or Zillow tab and does not copy browser cookies. Therefore it may see less than a browser in which the operator is already signed in. If a site requires sign-in or shows a block, stop; do not try to work around it.

## First-time setup

1. Open the WholesaleOS project folder in File Explorer, then open Terminal in that folder.
2. Run `node scripts/wos-local-comp-agent.js --init-config`.
3. Enter the dashboard's HTTPS address and the operator's dashboard account ID when asked. This is the account ID, not the dashboard PIN. The values are stored in `.local-comp-agent.json`, which is ignored by Git. Do not send that file or its contents to anyone.
4. Confirm that the Node.js command works. No npm install or new package is required. If the command is not recognized, use the Node executable already bundled with Cursor to run the same script.

## Run one property

First open the main dashboard and select the market. Use a row with a complete, source-supported property address. Copy that exact address and run one command from the project folder, replacing the example market and address:

```text
node scripts/wos-local-comp-agent.js --market "Dallas|Dallas|TX" --address "123 Example St, Dallas, TX 75201"
```

The market format is `City|County|State`. The supported listing sites are selected with `--site zillow`, `--site redfin`, or `--site realtor`; Zillow is the default. An exact queue key may be used instead of the address when it is available with `--queue-key`.

The helper checks the live dashboard snapshot before opening a listing page. It refuses a partial, venue, or otherwise unsupported address. It visits at most four pages for one row, captures at most four regions, processes only one row at a time, limits browsing to 30 pages in a rolling hour, and uses the existing 90-second run budget. It never takes a blind full-page screenshot. If a page cannot be classified safely, it records the reason and stops.

Each sold-comp image is locally read with Tesseract first. A screenshot is uploaded only when that reading contains an address, sold price, and sold date. The server then runs its existing OCR proposal flow again. The dashboard displays the stored image, proposed fields, source page, and capture time. Nothing is confirmed automatically.

On a property-detail page, a small visible region with an explicit list/asking-price label may also be uploaded as `subject_property` context. The screenshot may show days-on-market, but the current evidence allow-list does not store a days-on-market field. A list price is not a sold comp and does not unlock ARV.

## Review in the dashboard

1. Return to the same market on the main dashboard and refresh the page.
2. Open the Manual Evidence Packet card for the property.
3. Inspect each image, source link, proposed address, sale date, and price against the image and source page.
4. Confirm only values that are actually visible and correct. Otherwise leave the proposal unconfirmed or correct it manually from the image.
5. The dashboard's existing evaluator decides whether confirmed comps pass the existing distance, property-type, size, bedroom/bathroom, age, lot, provenance, recency, and price checks. Three passing confirmed comps are required for `Can value: YES`.

`Ready to offer` will remain `NO` or `UNKNOWN`; this cycle does not authorize an offer. It does not change any comp rule, source evidence, phone/contact workflow, saved lead, or market routing. The line “Rows with 3 confirmed comps in this sample” is limited to the dashboard's currently selected evidence sample, not a full-market total.

Local run summaries are written under `exports/cycle-30-comp-capture/`. The folder is Git-ignored. A log contains counts, host names, stop reasons, elapsed time, and the source-established subject address; it does not contain screenshots, owner/contact data, operator ID, or full source URLs.

## Current limits

- This is a bounded public-page experiment, not a guarantee that Zillow, Redfin, or Realtor will expose sold cards in an anonymous browser. A block is an honest stopped run, not a reason to bypass site controls.
- A local synthetic test proves the capture-to-proposal path without contacting listing sites. One real row still requires Gabriel to inspect and confirm the resulting evidence in the dashboard.
- The repository already has a separate optional screenshot-comp browser path behind `enable_screenshot_comp_evidence`; Cycle 30 does not enable, call, or extend it. That older path is a separate review item because the repository-wide “no server-side listing fetch” condition cannot be claimed while it remains present.
- Gemini/Groq vision is not enabled. Tesseract remains the only proposer; the existing dashboard confirmation and strict comp evaluator remain authoritative.
