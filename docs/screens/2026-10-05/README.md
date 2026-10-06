# Production screen audit - 2026-10-05 local time

These are read-only captures of the signed-in production dashboard. Each screen has
a 1366 x 900 desktop image and a 400 x 900 phone image. Owner, buyer and operator
names, contact details and street addresses visible in the captures were covered
before these images were added. Black areas are deliberate privacy redactions.
No state was populated, search run, message sent, lead edited or batch started.

| Screen | What Gabriel can see | Desktop | Phone |
| --- | --- | --- | --- |
| Dashboard / Deal Desk | The six-market snapshot, current urgency, and evidence packet; Dallas shows two mail-ready source rows but no call-ready rows. | [Desktop](dashboard-desktop.jpg) | [Phone](dashboard-mobile.jpg) |
| Leads | Dallas mode says no Dallas leads ready yet, although the sidebar shows a global lead badge. | [Desktop](leads-desktop.jpg) | [Phone](leads-mobile.jpg) |
| Review Queue | No deal-buyer matches; the view shows four buyers and no leads for matching. | [Desktop](review-desktop.jpg) | [Phone](review-mobile.jpg) |
| Pipeline | The visible deal stages are empty. | [Desktop](pipeline-desktop.jpg) | [Phone](pipeline-mobile.jpg) |
| Buyers | Four visible buyers are labeled verified, but no matching deals appear and Buyer Finder says not connected. Buyer identities are redacted here. | [Desktop](buyers-desktop.jpg) | [Phone](buyers-mobile.jpg) |
| Deal Matching | No matches yet; the view asks for leads and buyer criteria. | [Desktop](matching-desktop.jpg) | [Phone](matching-mobile.jpg) |
| Outreach Hub | No lead selected and no outreach performed; buyer identities are redacted. | [Desktop](outreach-hub-desktop.jpg) | [Phone](outreach-hub-mobile.jpg) |
| Dialer | Manual `tel:` link opens the operator's phone; the server does not dial and recent calls are empty. | [Desktop](dialer-desktop.jpg) | [Phone](dialer-mobile.jpg) |
| SMS | Server SMS sending is disabled; the conversation column remained on "Loading conversations..." during this audit. | [Desktop](sms-desktop.jpg) | [Phone](sms-mobile.jpg) |
| Follow-ups | No follow-ups are shown. | [Desktop](follow-ups-desktop.jpg) | [Phone](follow-ups-mobile.jpg) |
| Contracts | A contract template is present, but no contracts have been generated. | [Desktop](contracts-desktop.jpg) | [Phone](contracts-mobile.jpg) |
| Assignments | No assignments or fees are shown. | [Desktop](assignments-desktop.jpg) | [Phone](assignments-mobile.jpg) |
| All States | State cards and stored counts eventually appeared. The "Click to Populate" action was not used. | [Desktop](all-states-desktop.jpg) | [Phone](all-states-mobile.jpg) |
| Search Deals | A search form is visible; no search was run and no recent searches were shown. | [Desktop](search-deals-desktop.jpg) | [Phone](search-deals-mobile.jpg) |
| Import | CSV import and source-run controls are visible, but no import or run was started. Some source marketing claims need verification before use. | [Desktop](import-desktop.jpg) | [Phone](import-mobile.jpg) |
| Automation | Scan and matching controls are present; none were run. | [Desktop](automation-desktop.jpg) | [Phone](automation-mobile.jpg) |
| Settings | Company, security, team and maintenance controls are present; no setting was changed. Personal details are redacted. | [Desktop](settings-desktop.jpg) | [Phone](settings-mobile.jpg) |
| Opened lead card | A source-backed notice card distinguishes known facts, guesses and seller questions; its displayed contact and value axes are both NO. Property and identity details are redacted. | [Desktop](opened-lead-card-desktop.jpg) | [Phone](opened-lead-card-mobile.jpg) |

## Read-only market snapshot

The numbers below were read from the Deal Desk on October 5 local time. Dallas
auto-runs every 20 minutes, so its source-row count can change while this report
is being read. Source rows are preview records, **not saved leads**.

| Market | Source rows | Saved leads in this market | Mail ready | Call ready | After the sale | Excluded after proof review | Auto-run |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Dallas County, TX | 296 | Not exposed per market | 2 | 0 | 0 | 2 | On |
| Bexar County, TX | 61 | Not exposed per market | 0 | 0 | 0 | 0 | Off |
| Wayne County, MI | 0 | Not exposed per market | 0 | 0 | 0 | 0 | Off |
| San Diego County, CA | 25 | Not exposed per market | 0 | 0 | 0 | 0 | Off |
| Los Angeles County, CA | 15 | Not exposed per market | 0 | 0 | 0 | 0 | Off |
| Harris County, TX | 0 | Not exposed per market | 0 | 0 | 0 | 0 | Off |

The dashboard's all-market source-row total was 397 at the final read. Its global
saved-lead badge showed 12,039, while Bot Status said "Leads in DB: 300". Neither
is a per-market saved-lead count; the disagreement requires a separate audit.
Dallas showed 11 batches and 19 new source rows *today* at the final read. This
confirms activity, not a seven-day success history by source. The existing
dashboard did not expose a seven-day source-success table, so that field is
**not measured** for every market. Bexar, San Diego and Los Angeles have stored
snapshot rows but their current source-run health is unproven by this read.
Wayne and Harris have zero current snapshot rows; zero is not proof that their
counties have no public data or that a configured source failed. The older County
Onboarding panel lists 17 blocked candidate profiles, but its August artifact
cannot establish source health for the last seven days.

## Issues observed

- The SMS conversation list stayed at "Loading conversations..." with sending
  disabled; it did not reveal a usable conversation view.
- The Leads screen reported no Dallas leads ready, while its global badge showed
  12,039. Bot Status separately reported 300 leads. The scope and freshness of
  these counts are unclear.
- The Import screen presents source claims such as a free Redfin listing pull.
  This audit did not run those controls, so it does not verify the claims.
- The desktop and phone screenshots show the layouts, but the phone view is dense
  and requires vertical scrolling for several screens.
