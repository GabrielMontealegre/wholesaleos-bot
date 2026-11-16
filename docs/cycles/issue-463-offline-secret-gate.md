# Issue463 Offline Secret Gate

## Scope And Trace

Owner/architect ordered one hardening PR after the current454 reply slice and
before455. PR462 is now verified. The architect audit reported no exposed
credentials;this change does not rotate/read/change credentials or settings.

Writers:local operator files remain local;Git add observes .gitignore,local Docker
COPY context observes .dockerignore. No runtime data writer/auth/schema changes.
Readers:git ls-files -z supplies only tracked file paths;test reads their bytes,
decodes UTF-16 BOM text/legacy ASCII-compatible text,skips other binary/NUL
content,and passes text to pure offline-secret-scan.
Served dashboard files and courthouse-tab.js get process.env/provider rules with
no synthetic exemptions. drive-uploader.js is not a served browser file.
Pure scanner has no filesystem/network/clock. Returned diagnostics contain ONLY
file,line,rule;no value,excerpt or hash. Existing full-suite CI executes this new
test before a merge;no new workflow permissions/dependencies/services.

Detector families:private-key/cloud/Google/GitHub/provider/Twilio/JWT/password
URLs/Sentry/bearer and high-entropy credential assignments. Assignment identifiers
include camelCase. Quotes inside expressions are not variable assignments.
Known public ledger/queue/source/one exact storage coordinate are not authentication assignments;
provider detection still applies to their values. This is a conservative heuristic
gate,not a whole-history audit or a guarantee against every encoding/obfuscation.

Only tests allow word-like fake credentials or a same-line explicit
synthetic-secret-fixture marker. Realistic unmarked provider tokens fail even in
tests;no blanket test-directory exemption. Four existing synthetic data lines get
markers:county appraisal213,public-record browser39,serper diagnostics7,server
free-board102. These are annotations only,no assertion/value behavior change.

## Negatives And Gates

In-memory temporary forged provider fixtures fail with value-free coordinates;
word-like fixtures pass;explicit markers never exempt served files. Each detector
family,camelCase/quoted JSON assignment,UTF-16/legacy text,pure clock/network spy,determinism and
escaped-expression false positives covered. Long random letters are not word-like;
human passphrases outside tests are not exempt. Exact credential-name tokens avoid
matching assertion-label prose. Git ignore checks cover env/key files
and keep .env.example trackable;Docker expected private-path list asserted.
Focused gate passes current tracked source. Full262/600s-file,review,current-head
and automatic deployment/read-only verification still required;NOT released yet.
No real key/file/upload/secret scan outside tracked source/provider request used.

## Operator Boundary

The issue asks Gabriel,not Codex,to enable GitHub Secret Protection and Push
protection in repository Advanced Security. No repo setting changed here.
Rotation remains after the first closed deal per owner;no new rotation request.
454 scoped-key/local uploader follows this hardening;455/456 remain deferred.

## Engineering Release Verified 2026-10-27

PR464 mergea2dc46e2e125a4e9c340f0934693346a34134024 full tree identical to
tested99ceb75d53d1c22c70843b0d6235b529add0a8a9. PR40490468008/job122143342544
262/0/0,600s/file,14m25job/13m28teststep,sum806.59s NOTwall,newgate2.18s.
MAIN40492803077/job122150687766262/0/0,13m00job/11m49teststep,
sum708.56s NOTwall,newgate1.73s. All262+262 rows retained. Earlier3af6/2df runs
40489785955/40490001985 concurrency-CANCELLED after real self-review fixes:
UTF16/legacy text then tests-only word-like exemptions/credential-name tokens.
Not product failures and not reused gates. Four fixture annotations changed no
values/assertions. No dependencies/locks/auth/runtime writers/settings changed.

AutomaticRailwaye5a29d49-0ccd-49b5-855b-3c7554174074 Active/successful,
authoritative Details exact source verified,no manual build/retry/settings.
Approved435 public pinned1.44/Chromium1117 12 GET-only cases true at1366/400/412,
health200,unsignedidentity401/privateGET401no-store,no auth/cookie transfer.
Exact merged offline gate and pinned synthetic mailbox5size PASS. Main full gate
also retains actual navigation/exact-record/locked/nonadmin/assistant journeys.
Existing signed ChromeToday1280x585 latestABSENT/emptychooser/hidden disabled
confirm/Open recorded work/caps-onlyGET schema1,max1048576,canImporttrue,
viewerScopevalid. Email1280x52948rows/full2117body/no defaultcomposer;
emptyReply PreviewEditSenddisabled/finalunavailableGmail/allfieldsfit/Close restores.
Classic19->exact1workbench->visibleBackLoading0->same19/0,no unrelated navigation.
Initial classic selector deadline completed SAME transition;not a retry/failure or
speed claim. No overflow/application console errors;2 pre-merge10:56:30 Grammarly
chrome-extension entries in retained mail-tab log are not application errors.
Screens OPAQUE BEFOREdisk,inspected. No real files/keys/import/POST/Copy/telSMS/
check/draft/send/settings/business writes. No new FCP/Lighthouse claim:security/
build gate only,no screen changes. Proof docs/screens/2026-10-27-pr464-release.

463 engineering acceptance DONE. Read-only GitHub status still disabled for both
Secret Protection and Push protection;owner asked once to enable them himself.
Issue stays OPEN for that irreducible operator action,not duplicate coding. No
whole454 wait:scoped-key/local uploader is next,synthetic only/no real key action.
