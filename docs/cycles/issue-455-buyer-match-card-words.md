# 455.8B3 - Buyer Matching Deal Card Words

Independent of BLOCKED477/478. Only the nested matching/near-miss deal card
button labels change from internal reference + location to Open deal + existing
city/state/ZIP. Empty location gives Open deal,not a code or invented address.
Buyer fullrecord identity/subjects/timeline/search remain unchanged. No477
runtime/tests bundled. NativeDeals unauthorized;legacylistfaces remain later8B.

## Trace

- record-activity.js canonical reference assignment/sequences/history/search
  unchanged. reviewed-deals.js evaluate retains strictvalue/status/approval/
  matching gates and exactdeal.id;no value/identity writer changes.
- modules/buyers/deal-fit-view.js build reads canonical deals/buyers/evaluator,
  computes matches/near_misses,projects id/ref/city/state/zip/asking/buyer_max/
  profit/checks and derives teaser_ready through existing jv-workflow.teaser.
  No projection/gate/data changes. assistant-finds.js listFinds attachesdeal_fit
  and canonicalbuyer record_ref/email_subject/source/identity as before.
- dashboard/wos-buyers-found.js dealRows only uses human command/location for
  label;data-buyer-deal anddata-buyer-email-deal keep d.id. Existing clickhandler
  openReviewedDeal(openDeal.dataset.buyerDeal) unchanged. Matching and near-miss
  eligibility,disabled availabilitycheck,checkboxcount/uncheckedstate,selection
  identity,derivedprofit/checks/source/evidence and actual preview/draft/send
  version/review/recipient/rate/uncertainty guards unchanged.
- CachebuyerJS12 ONLY. Nativeapp14/CSS15/classicToday6/Deals18/Public57/Email15/
  layout3/nav3/sharedlogin1/auth3/keySettings2/components6/assistantmodel2/sheet3/
  reply1/todaymodel1/emailmodel2/currentmainworkflowversions unchanged.

## Tests And Gates

New buyer-match-card-words-ui actualdashboard1366/400/412:exactthreebuttonlabels,
exactdistinctIDs,emptylocationfallback,no structuredrefmetadata on nestedfaces,
source note containingBUYcode escaped/preserved,no script/image execution,
ready vs unavailable unchecked email selections,near-miss never selectable,
exact matchingdealOpen/Back/fullrecordidentity,no writes/external/errors/
overflow,immutablefixture/projection/store. Existingassertions changed:NONE.
SixfocusedfilesPASS newmetadataUI,buyerworkspaceUI+unit,dealcardnavigation,
recordactivityUI,offlinegate(currenttrackedfiles;newfilesstagedscanstillrequired).
Actualfull278PR+MAIN/currenthead+selfreview/exactautomaticdeployment/public15/
sameSHAsynthetic/signedSTRUCTURALONLY andbeforeafter FCP<2s/performanceAND
access90+three-size UIaudit required. Currentaudit usesfixedcanonicalbuyerroute
andactualselectedMatchingdealstab,no parentTodayoverlay workaround.

## Scope And Assumptions

AGENTS2/3 ordered8Bconsumer-boundary slice. Onlydisplaylabelchanges;no migration,
deletion,backend/auth/provider/clock/writer/nativeDeals change. Sourcecity/checks
may legitimately contain code-like strings;no regexcensorship. Fullrecord refs
remain accessible. Whole455.8 NOTcomplete:477blocked478 andlegacyfaces remain.

477retainedbranch412ed2e hasFIRSTsyntheticfixtureannotationfix+failedproof
UNPUSHED;remote47170f6 real277/1/0 andUIperformancefailed. No runtime bundled
or unchangedgate rerun. Production remainsverified476/f6d7f522.
