# Explicit Pipeline Producer Input (Slice 3)

Local/offline default:

```powershell
node scripts/submit-assistant-finds.js --input-dir <folder> --pipeline-file <reports.json> --baseline <local-references.json> --dry-run
```

The explicit file accepts an array, `{ "items": [...] }`, or
`{ "pipeline_items": [...] }` with optional sibling metadata. Each row uses
the existing `pipeline_item` contract from issue-395-pending-reports.md.
No Markdown/prose is parsed, no value is guessed, and no optional file is
discovered automatically. The four existing default files are unchanged.

The local baseline must contain the referenced records. Offline duplicate
counts refer only to that supplied local baseline, not live production.
The server revalidates current references and report history on any later
explicit submission. A stale baseline cannot override server truth.

Reports remain pending. Adding `--submit` still uses existing paired config,
signed endpoint, fifty-row/byte caps, ten-request ceiling, one-second pace,
stop-on-refusal and uncertain-result no-retry. Building/testing this option
does not authorize running it against real private files or production.

Trace: CLI options -> explicit bounded regular JSON file -> canonical mixed
validator/upsert in a local copy -> aggregate-only plan -> existing batching
and signed submit (only when explicitly selected). No new endpoint, writer,
credential resolver, approval or source/value/contact gate.

New hermetic tests cover baseline required, exact refs, duplicates, forged/
future/ambiguous rows, wrong kind, prose/ambiguous wrappers, missing/oversized
input refusal, no implicit discovery/config read, no private log values and
zero real network/writes. Existing producer regressions remain unchanged.
Full suite and release gates are still pending.
