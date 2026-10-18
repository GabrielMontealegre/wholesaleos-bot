Item: #366 remaining architect copy/help findings

Sidebar explanations now describe the actual destination instead of repeating
the same generic evidence sentence. Unknown legacy destinations have no fake
fallback. Today action headings show the existing recorded person/buyer name
or permitted property heading; references remain small routing metadata. The
empty Best list uses plain English and links to the actual pending count.
Voice toolbars sit outside their field label, avoiding nested labels and the
unrelated inherited help seen during live proof. No new feature or backend rewrite.

Writer/reader trace: existing conversation projection.person, buyers.name and
reviewed_deals address/location -> buildTodayWorkspace derived heading -> Today
markup only. No stored field or raw fact is added. JV heading calls unchanged
jv.view(full_package_evidence_ready) before showing any street address; otherwise
location only. IDs are not guessed into names. Existing action keys, record_id,
labels, ref, source_kind, counts, sort, deadlines, grade and evaluator are unchanged.
Existing API registration/store/guard and all writers are untouched.
Counts.approvals -> empty-state link; existing click handler still opens Approvals
with unchecked source-review controls. No auto-approval or new count calculation.

Sidebar read-only onclick destination key -> static whitelisted page copy on
data-help-copy -> existing escaped textContent tooltip. No eval, network, title
or handler rewrite. Nav group headings are not fake evidence fields. Old focus,
long-press, stale-DOM suppression, Escape and confirmation protection unchanged.
Voice observer now inserts after the enclosing label; recognition, final text,
on-device privacy, cancel, save/send rules and all controller behavior unchanged.
Cache busts: Help4,Today4,Voice2.

Tests: new pure unit covers reported names, missing/code-as-name fallback,
unsigned-address guard, exact counts/target IDs, escaped content and no
network/clock/write/store mutation. Actual full-dashboard1366/400/412 proves
distinct sidebar help, omitted unknown destination, name-first queue, exact
approval count/link with unchecked review and no writes/external requests.
Existing hover-help safety, Today unit and voice UI focused suites pass.
Existing assertions changed: none. Voice UI's toolbar locator now targets the
new direct .email-composer child instead of the label; every original audio,
draft and Send assertion remains, with new no-nested-label assertions added.

ASSUMED logged: names are reported workflow labels, not new identity proof;
unknown stays missing, unsigned streets withheld. No comp, contact, readiness,
auth, source, evaluator, JV workflow, dependency or business writer change.
Self-review: only additive derived display text/DOM semantics; no routing change.
Full214-file hosted suite600s/file and exact live1366/400/412 read-only proof
required before DONE. Voice release checkpoint rides this PR, avoiding a
docs-only deploy. Email's observed per-message read failure remains recorded,
not claimed fixed. I/C BLOCKED#383/#379; no full#341 sign-off inferred.

![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-navigation-copy/docs/screens/2026-10-18-366-copy/synthetic-nav-1366.png)
![Phone](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-navigation-copy/docs/screens/2026-10-18-366-copy/synthetic-nav-400.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/366-navigation-copy/docs/screens/2026-10-18-366-copy/synthetic-nav-412.png)
