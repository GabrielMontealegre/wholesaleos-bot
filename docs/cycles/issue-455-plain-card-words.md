# 455.8 Plain Card Words

## Ordered Scope

8A: the four owner-specified labels and reviewed-deal compact-face reference.
8B follows separately for remaining metadata on native/classic Today, approvals,
buyer/match, conversation, pipeline, notification and legacy card faces. Full
record search/history/source evidence retain identity and provenance.455.8 is
NOTcomplete until its remaining face references are resolved;455 stays5/9(56%).
Dates471 and fixture identity472 remain blocked. No native Deals rebuild.

## Writer/Reader Trace Before Edits

- modules/deals/reviewed-deals.js validate/ingest/update/list own claimed_arv,
  canonical record references and source-backed review state. list returns
  counts.vetted_today/daily_target/jv,DTOrecord_ref,email_subject and evaluations.
  All backend code/calculations/storage/API schemas remain UNCHANGED.
- dashboard/wos-todays-deals.js card reads those DTOs. Compact summary stops
  printing the separate record_ref label; data-deal-id,full-record reference,
  timeline/matched buyer/match IDs and Open/Back handlers remain untouched.
  Seller's value (their claim) still renders ONLYclaimed_arv,not our value.
  I re-checked the listing today still binds existing recheck action/payload;
  it is a command,not a claim that the check already happened automatically.
- markup labels the SAMEvetted_today value Checked today:Nof10;unknown omitted,
  realzero shown. EligibleJV summary label removed as requested;underlying
  eligibility predicates/count/record cautions/introduction gates are unchanged.
- dashboard/wos-public-deals.js ensureSection/render/fetchLatest present preview
  provenance. Wording becomes Preview:not saved yet in home/finder/hint/empty
  note. preview_only/not_a_saved_lead/queue caches/promotion/autoRundefaultOFF
  remain unchanged. No blanket source/name/message/reference-string censorship.
- dashboard/index.html consumes classicDeals18/publicDeals57. NativeCSS15/app13,
  Email15/layout3,assistant/login/nav/current consumer keys remain untouched.

## Tests And Assertion Changes

New plain-card-words-ui tests actual dashboard at1366/400/412 with synthetic APIs:
four labels,metadata-only reference removal,source-provided name containing a
reference retained,exact data-deal-id/Open/Back/fullrecordreference preserved,
claimed350000 separate from reviewed money/JVshare6625,review checkbox unchecked,
unchanged recheck action,zero-vs-unknown,home/finder previews/defaultOFF/no writes.

Existing scripts/verify-filter-hygiene.js changes ONLY intentional text checks:
Vetted today->Checked today;real0is Checked today:0of10;EligibleJV0label assertion
becomes absence per owner,while all existing unknown/zero/navigation/filter/
geometry/writer assertions remain. dashboard-public-deal-queue.test.js two
cache-version checks56->57 preserve current-consumer security/helper assertions;
line940 oldliteral not saved leads becomes Preview:not saved yet, preserving
the preview-versus-saved provenance intent. Initial local focused run caught
that oldliteral; first test-only correction,not a full-CI/product/live failure.
No gate/assertion removed to hide a defect;all backend value/role/privacy tests
remain unchanged. Full276,sourceUIaudit,selfreview/release still pending.

Initial serialized UI audit: beforeANDafter preview accessibility88,below90;
Deals100performance/98access,preview94/90performance. AllFCPunder2s/nooverflow/
runtime errors. Retained under audit/initial-access88,NOTgreen/notlive.
One bounded diagnostic retained separately identifies unnamed manual evidence
source selects and file inputs (plus pre-existing sidebar/main-landmark issues).
Diagnostic performance78 is NOTa release result or dismissed as flaky.
First scopedPRODUCTfix adds escaped per-slot accessible names and wraps the
same preview header controls/Market label so phone labels do not become vertical
letters. No file reads/uploads/handler/value changes. New test asserts all names
and compactMarket height. Revised source requires its own full UI audit; no
oldfailedgate reused. All prior AGENTS safety checks remain.

Revised serialized audit: access98/98 BOTHviews,Deals performance100/100,
preview78/90. Accessfailure resolved by first productfix;desktop performance
still below90. FCPallunder2s/nooverflow/runtime errors. Retained separately as
label-fix-access98-perf78. One bounded baseline/candidate desktop metric/shift
diagnosis nowrequired;no unchanged-gate loops/no performance-threshold waiver.
No full276 or production merge/deployment yet.

Performance diagnostic on same source45c2a51: unqualified classic root BEFORE
landed on Leads empty-state(LCP4.45s/performance69),AFTERpreview94 withCLS0.152.
This is not a repeatable preview baseline or a passing retry. Audit helper had
used unqualified/dashboard/,which can select legacy routes;corrected to fixed
/dashboard/?workspace=today,requires APP.page=dashboard and actualpreviewpanel,
and requires Lighthouse finalURLretain workspace=today. No product/gate change.
All oldwrong-route/performance reports retained;cause of earlier78 not proved.
Correctly routed exact-source fullUIaudit stillrequired;thresholdsUNCHANGED.

Corrected complete audit PASS on productidentical50c38e3:actualpreviewroute
asserted,AfterDealsFCP91.3/72.8/74ms;Preview75.9/77.4/73.5ms at1366/400/412.
LH13.5performance100/100Deals,94/90Preview;access98/98bothviews,nullruntime/
emptyauditerrors/nooverflow. BaselinePreview88 retained. All12audit+18finalstate
images inspected;oldfailedreports untouched. SYNTHETICnotlive. No productchange
was made for performance;verification nowchecks actualintendedview with stronger
route/panel checks. PR475DRAFT50c38e3/full40866755234 job123423339447 pending;
no merge/deploy yet. Existingassertionchanges remain documented above.

## Owner Usage Policy

### First Full Gate Correction

Full40866755234/job123423339447 on50c38e3 TERMINAL275/1/0(all276),600s/file,
16m33job,sum914.56s NOTwall;all276timings retained in failed-pr-50c38e3-timings.json.
scripts/verify-record-activity-ui.js:29 expectedcompactcardWOS-FL-1031;owner455.8
intentionallyremoves thismetadata. Firsttest-onlycorrection requires exactdeal1
dataidentity,zero compactreference nodes and no compactreference text. ALLlater
detailreference/email-subject/timeline/buyer+matchrefs/search/history/privacy/
immutability/nowrite assertions UNCHANGED. CorrectedtestPASS1366/400/412.
Runtimeidenticaltested50c38e3;notflaky/environment/cancellation/reusedsuccess.
Newexactfull276required;no merge/deploy untilgreen.

Gabriel2026-10-29 explicitly replaces oldlarge-reserveholds:work until about95%
5-hour usage,keep about5%forrevert/redeploy;resumeautomaticallyafterreset. Do not
stop early forweekly budget;owner alone handles his manualreset. Under10%weekly
remaining is written at TOPbacklog summary forarchitect. Noagentpurchase/reset.
AGENTS release/safety/readonly/revert rules remain. Current40%/59%used atstart;
no low-weekly warning threshold crossed. Existing heartbeat updated to15min and
newpolicy takes precedence over historical reserve notes. No hiddenbusinessjobs.
