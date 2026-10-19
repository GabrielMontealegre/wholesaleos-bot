# Connect The Local Assistant Files

## Operating Steps

The producer is now a local command, not a background job. It reads only
buyers.json, land-buyers.json, deals.json and agents.json under the chosen
input directory. It does not browse a source or search for private files.

Run the safe check from the checkout containing your assistant exports:

```powershell
node scripts/submit-assistant-finds.js --input-dir exports/assistant
```

This is offline by default: no network, pairing-config read, file write,
approval or outreach. Output contains counts and fixed reasons only.
Input must be an array, or an object containing only an items array.
Buyer/deal fields must already satisfy the existing importer contract.
No address, date, source, identity, price or buy box is filled in by the tool.
Land buyers are ordinary buyer records only if their supplied fields validate.
Agents are reported as unsupported, never relabeled as property buyers.

The duplicate scope is stated explicitly. Without a baseline it covers only
the supplied records, not the live database. To compare against a private,
read-only local copy of the canonical store, pass --baseline FILE. The copy
is never modified. Neither preview claims to be an up-to-date live count.

After reviewing the counts, a separately authorized operator can submit:

```powershell
node scripts/submit-assistant-finds.js --input-dir exports/assistant --submit
```

Submit reads the existing paired helper config without probing, migrating,
writing or printing it. --config FILE selects a particular existing config.
If pairing is absent or expired, use the dashboard's existing pairing flow;
never pass a token on the command line. The destination is the existing
WholesaleOS production origin, or explicit local HTTP fixture origin only.
Redirects and other destinations are refused.

File-level read/JSON/shape/size errors must be corrected before submitting,
so a broken file cannot silently disappear. Individual rejected rows remain
excluded and counted by reason; valid rows can still be submitted, just as
in the existing pending importer. A report with rejections returns a nonzero
exit even if its valid rows were accepted; do not retry it automatically.
Requests use only
POST /api/assistant/finds with the existing signed agent token. New rows
remain pending. Existing operator edits/approvals are preserved by the same
canonical importer; the CLI adds no approval or update-by-ref workflow.

Limits:4MiB per file,500 rows,50 records/256KiB per request and10 requests
per invocation. Requests are sequential with at least1s between completed
requests and the next start. Existing server12/hour limit still applies
across repeated invocations; the CLI does not bypass or reset it.
401/403/429 stop immediately. Network failure,5xx or malformed result stops
as outcome unknown; do not retry automatically. An operator must reconcile
the live counts read-only before deciding on another authorized attempt.
Reports separate confirmed created/duplicate, unsubmitted and unknown rows.

No real input or live submit was used during release verification. C feed
reconciliation remains unmeasured until the first separately authorized run.
No full#341/#366 sign-off follows from releasing this producer.

## Writer And Reader Trace

-The local routines remain the writers of ignored exports/assistant files.
 The CLI reads only the four named files and optional private local baseline.
-buyer-find-import.validateAgentItems delegates to assistant-finds and
 reviewed-deals validation; ingestMixed supplies exactly the existing local
 duplicate rules. Local dry-run state is in memory and never persisted.
-Raw validated records, not enriched internal normalization fields, go to
 the unchanged signed assistant-find-routes POST. Its existing agent scope,
 validation, ingestMixed and db.writeDB remain the only live write path.
-Existing assistant_find.approval, operator buyer type, deal approval/status
 and activity readers in Buyers found/Approvals/Today/Calendar are unchanged.
-local-config-path.candidateList is read-only; the writable resolver is not
 called. Pairing/auth code, helper lifecycle and permissions are untouched.

New fixture-only tests prove offline/no-side-effect default, count privacy,
validation negatives, no agent relabeling, dedupe, preserved operator state,
pending new rows, origin/redirect safety, bounded requests/pace and uncertain
outcome/no-retry. Existing assertions are unchanged. An initial fixture used
the same phone for two intended distinct buyers; canonical dedupe correctly
merged them. The fixture now uses distinct synthetic phones, with the same
assertion of one new buyer and two existing duplicates.
