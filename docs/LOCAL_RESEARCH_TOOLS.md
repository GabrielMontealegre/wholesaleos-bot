# Local Research Tools

These tools are installed for Codex-assisted research on Gabriel's computer.
They are deliberately outside this repository and are not Railway dependencies.

Install root:

`C:\Users\criss\Desktop\Github-Codex folder\WOS-Research-Tools`

## Agent Reach

Purpose: discover public pages, repositories, feeds, documentation, and candidate
government sources. It is an internal discovery helper, not a property-data,
owner, skip-trace, or comparable-sales provider.

Environment:

`WOS-Research-Tools\agent-reach\.venv`

Verified local version: `1.5.0`

Installation mode: isolated Python environment followed by `--safe`. No system
packages, cookies, social-media credentials, or production configuration were
installed.

Codex skill: `C:\Users\criss\.codex\skills\agent-reach`

Allowed use:

- Find candidate official county pages and datasets.
- Read public documentation, feeds, and repositories.
- Produce candidate URLs for the Source Registry verification process.

Not allowed:

- Treat a search result as lead evidence.
- Infer an owner, seller, address, price, event, or date.
- Bypass a login, CAPTCHA, paywall, WAF, or access restriction.
- Run as an unattended production dependency.

## Docling

Purpose: evaluate an additional document parser against the frozen county PDF
corpus. It does not replace the current text/OCR path unless a measured benchmark
shows better extraction without provenance loss.

Environment:

`WOS-Research-Tools\docling\.venv`

Verified local version: `2.126.0`

## Crawlee

Purpose: bounded traversal of public, permitted pages when a static request is
insufficient. Prefer its HTTP parsers first; browser rendering is a last resort.

Environment:

`WOS-Research-Tools\crawlee\.venv`

Verified local version: `1.10.0`

Rules:

- Use explicit host allowlists, request caps, page caps, and timeouts.
- Respect site terms and robots/access controls.
- Never add stealth, CAPTCHA solving, residential proxies, or cookie extraction.
- Discovery results stay candidates until an official schema or document proves
  the required fields.

## PaddleOCR

Purpose: offline comparison against the same frozen scan corpus when Docling and
the existing Tesseract path are insufficient.

Environment:

`WOS-Research-Tools\paddleocr\.venv`

Verified local versions: Paddle `3.3.1`, PaddleOCR `3.7.0`

PaddleOCR must not write normalized addresses directly. Any proposed extraction
must pass the same address, document-provenance, review, and quality gates as the
existing OCR path.

## Integration Rule

Codex also has a validated `wholesaleos-source-discovery` skill. It selects the
smallest appropriate tool, requires bounded official-host discovery, and keeps
all discovered sources in candidate status until the normal verification gates
pass.

External research tools can suggest a source or extract candidate text. They can
never promote a row by themselves. WholesaleOS remains the authority for:

- official host and source validation
- property identity and address quality
- evidence text and source URL preservation
- lifecycle and contact-role classification
- comp verification and ARV/MAO locks
- operator readiness and saved-lead decisions

## Government Catalog Discovery

WholesaleOS also includes a bounded command that searches official ArcGIS,
Socrata, and Data.gov catalogs for possible county data sources:

```powershell
node scripts/discover-government-catalogs.js --county Dallas --state TX --city Dallas
```

Add `--write` only when a review artifact is needed. The command returns source
candidates, never leads. Every result remains `candidate_unverified`,
`preview_only`, `not_lead_evidence`, and `should_ingest:false` until a separate
source-verification pass proves the host, schema, fields, dates, and row meaning.

Data.gov's current catalog API requires an API key. The command uses its public,
low-volume `DEMO_KEY` for bounded exploration unless `DATA_GOV_API_KEY` is set in
the local environment. It never writes the key into a report or repository file.
