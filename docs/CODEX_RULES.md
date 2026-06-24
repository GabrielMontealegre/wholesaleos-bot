# Codex Rules

## Required Opening Context

Every Codex task in this repository must state:

- model and reasoning level when provided by Atlas or Gabriel
- what we are doing
- why it matters to the money path
- what should change
- what Gabriel should see
- risks
- next exact prompt or action

## Non-Negotiable Safety Rules

- No fake data.
- No fake contact.
- No fake comps.
- No fake ARV.
- No fake repair estimates.
- No fake MAO.
- No fake offers.
- No fake motivation.
- No fake addresses.
- No auto-ingestion unless explicitly approved.
- No saved lead mutation unless explicitly approved.
- No Analyzer, Dossier, Pipeline, or buyer writes unless explicitly approved.
- No Railway action unless explicitly instructed.
- No preview unless explicitly instructed.
- No production run unless explicitly instructed.
- No merge without verify.

## Forbidden Legacy Paths

Do not invoke these paths unless a task explicitly says to audit or remove them:

- legacy `comp-agent`
- legacy `skip-trace-agent`
- synthetic lead generation paths
- fake or demo deal paths
- old datasource scraping paths that bypass current evidence contracts
- old deal-engine logic that duplicates canonical opportunity logic

## Build Discipline

- Read the relevant code before changing it.
- Prefer additive, testable changes.
- Preserve ingestion and data safety.
- Reuse canonical modules instead of creating parallel workflows.
- Keep work bounded to one PR.
- Do not build more source adapters before selected-deal execution works.
- Do not loosen gates to make demos pass.
- Convert missing evidence into deterministic work orders.

## Release Discipline

- Confirm branch and changed files.
- Run requested checks.
- Stage only intended files.
- Commit with the requested message.
- Push the requested branch.
- Open PR.
- Do not merge unless explicitly instructed.
- After merge, update local main and run cheap verification before preview.

## Reporting Standard

Final reports should include:

- branch
- files changed
- tests/checks run
- what changed
- what did not change
- risks
- whether PR is ready
- whether production/Railway was untouched
- next exact action

