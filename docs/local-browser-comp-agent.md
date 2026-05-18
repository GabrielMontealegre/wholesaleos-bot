# Local Browser Comp Agent v1

## Purpose

The Local Browser Comp Agent is a localhost-only prototype for reading visible listing candidates from Gabriel's already-open Chrome session after any manual human verification is complete.

It does not scrape in the background, navigate pages, open tabs, click buttons, bypass CAPTCHA, save comps to leads, or mutate WholesaleOS data.

## Architecture

- Runs as a local Node service bound to `127.0.0.1`.
- Connects to an existing Chrome instance through Chrome DevTools Protocol.
- Reads the currently available page targets from Chrome.
- Captures visible DOM text from the selected page viewport only.
- Supports first-pass detection for Zillow, Redfin, Realtor, and Google search result pages.
- Returns unverified candidate comps as structured JSON for operator review.

V1 limitation: Chrome CDP target listing does not reliably expose the true active tab. Use `GET /tabs` to confirm the page target before capture. A future browser extension can provide reliable active-tab selection.

## Chrome Launch

Close other Chrome debug sessions first if needed, then launch a separate Chrome profile with remote debugging enabled:

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="$env:TEMP\wos-comp-agent-chrome"
```

Manually open the target page in that Chrome window. For example:

```text
https://www.google.com/search?q=site%3Azillow.com%2015567%20WARWICK%20ALLEN%20PARK%20MI%2048101
```

If Zillow, Redfin, Realtor, or Google asks for verification, solve it manually in the browser. The agent does not bypass verification.

## Run The Agent

From the WholesaleOS repo:

```powershell
$env:LOCAL_COMP_AGENT_PORT="8791"
$env:CHROME_CDP_URL="http://127.0.0.1:9222"
node modules/research/local-comp-agent.js
```

## Test Commands

Health:

```powershell
curl.exe http://127.0.0.1:8791/health
```

List browser targets:

```powershell
curl.exe http://127.0.0.1:8791/tabs
```

Capture visible candidates:

```powershell
curl.exe -X POST http://127.0.0.1:8791/capture-visible-comps `
  -H "Content-Type: application/json" `
  --data "{\"max_results\":5}"
```

## Candidate Schema

Each returned candidate is unverified and may include:

- `source`
- `title`
- `address`
- `price`
- `beds`
- `baths`
- `sqft`
- `status`
- `date`
- `url`
- `snippet`
- `extraction_status`
- `confidence_reason`
- `missing_fields`
- `verification_label`
- `capture_method`
- `page_url`
- `page_title`

## Failure States

The agent returns explicit safe states:

- `browser_not_connected`
- `unsupported_page`
- `captcha_or_verification_detected`
- `no_visible_candidates`
- `extraction_partial`

## Safety Boundaries

- Localhost only.
- One visible browser page at a time.
- Operator-triggered capture only.
- No auto-navigation.
- No auto-tab opening.
- No clicking.
- No scrolling loops.
- No hidden session export.
- No persistence.
- No ingestion.
- No fake comps.
- No AI-invented values.
- No CAPTCHA bypass, proxy, or stealth behavior.

