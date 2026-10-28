# Issue455 Item4A - Shared Card Times

Local candidate,NOT released. Base80660c6 is verified468;only owned468 proof
carried deliberately as7b0e31c.455items1-3 stay live. Item4 is NOT complete here.

## Scope And Trace

Writer:none. Backend records/adapters/normalizers/projections/import bytes/export
formats/source dates/actors/clocks remain untouched. Existing formatTime only
reads already-recorded timestamps and explicit now,then returns an escaped label
through the existing consumers. Its strict real-calendar UTC-Z parser and future
rejection are unchanged;numeric ambiguous dates/offsets/date-only strings never
become operational timestamps. formatDate and reviewed deadline equality checks,
owner UTC-7 calendar arithmetic,stage attribution/days and provenance stay intact.

Reader inventory from current source:
- Native workspace/app time -> action recorded_at,activity at,record detail.
- Native email-screen time -> list latest.date and explicitly opened body dates.
- Classic wos-email-reader time -> existing adapter-normalized message dates.
- wos-card-clock.reviewed -> first_seen_at/captured_at/history.at and source-backed
  JV happened_at/signature reviews;render summary/open deal clocks.
- wos-todays-deals -> posted_at/captured_at labels and hover detail.
- wos-buyers-found -> source captured_at,last_contact_at.
- wos-approvals -> submitted/review source timestamps.
- wos-conversation-cards -> last_in/last_out/email evidence captured_at.
- wos-calendar-workspace,wos-notification-workspace,wos-pipeline-workspace,
  wos-pipeline-report-review,wos-today-workspace -> existing recorded metadata.
All keep their current now supplier;no browser/server clock-authority rewrite.
Both classic and native HTML load shared clock cache2. No other cache family,
script order,stylesheet count,route/auth/send/provider/record behavior changes.

Display policy is rolling age<=7days,not calendar-week membership. Within that
window:Sat12:18PM;older:Oct24;different year:Oct24,2025. No hours are invented for
date-only records. Future operational events stay Unknown,not silently tolerated.

## Tests And Follow-Up

Only two existing reviewed-deal-clock expectations change:old same-year and
different-year labels drop their time under owner455. ALL original future/
ambiguous/wrong-origin/deadline/stage/attribution/immutability/escaping assertions
remain. New plain-card-times tests boundary7days and1ms older,calendar-week
rollover,UTC-7 midnight,differentyear,missing/type/calendar/ambiguous/offset/future
negatives;VM spies reject implicit clock/network/filesystem/entropy. Actual native
Email list/body and Today recorded activity render at1366/400/412 with exact source
body preservation,unchanged fixtures,no external/writes/pageerrors.

Remaining4B reader work is NOT claimed complete:assistant-sheet stamp/buyerRow/
source/header/log;Settings key/device stamp;independent legacy index renderers,
public-deals comp dates,patch comp date labels,record activity renderer and any
remaining nonshared card paths found in their bounded trace. Raw editor input
values,ISO API/storage/export values and source evidence are not presentation
labels and must not be rewritten. No broad DOM mutation fallback.

Focused seven-file set PASS,including actual reviewed-deal-clock UI and native
mailbox5sizes/Today/More/navigation;no local failures or lowered assertions.
Serialized source-switch baseline80660c6 synthetic audit PASS at1366/400/412:
after FCP Today167.2/110.7/112.4ms,Email112.2/148.7/159ms,Deals172.9/95.2/83.9ms;
before Today360.8/131.4/366.1,Email115.2/116.7/96,Deals486.5/142.2/86.7ms.
LH13.5 after performance99/96 Today,99/94 Email,100/100 Deals;accessibility
100/100 Today+Email,98/98 Deals;all runtimeerrors null/auditerrors empty,
nooverflow/pageerrors. Synthetic ONLY,NOTlive timing. Input fields masked before
disk;all visible data is seeded synthetic fixture content,not real private data.
18screens and numeric report in docs/screens/2026-10-28-plain-card-times-candidate.
No overlapping local tests during serial audits. Full274/current-head self-review/
main/deployment/read-only gates remain pending. No actual private capture:468 helper stays
disabled;only synthetic/public visual proof and signed DOM booleans are allowed
until validated frame-bound masking. No real credential/privatefile/provider/
settings/business actions. No full455item4 completion/percentage increase yet.

Initial7c3f5d3 full40764426231/job123084632155 REAL272/2/0,all274 timings retained
as initial-failed-timings.json,600s/file,14m51job,sum827.82s NOTwall. The two
conversation-card tests still expected the old Oct8,12:27PM label. First honest
correction updates unit/rendered expectations to Thu12:27PM for the fixture's
four-day-old timestamp and pins ONLY the browser fixture clock to its existing
payload today/now,so the test cannot age into failure. Adds an older conversation
label assertion. ALL urgency/order/role/duplicate refs/link/escaping/no-source-
inference/no-write/fixture-immutability assertions retained. Runtime product is
unchanged;this is an owner-intended expectation/scaffolding gap,NOT flaky or an
environment failure. A new exact-head full274 gate is required,not reuse of failure.
