# Issue463 Offline Secret Gate

## Scope And Trace

Owner/architect ordered one hardening PR after the current454 reply slice and
before455. PR462 is now verified. The architect audit reported no exposed
credentials;this change does not rotate/read/change credentials or settings.

Writers:local operator files remain local;Git add observes .gitignore,local Docker
COPY context observes .dockerignore. No runtime data writer/auth/schema changes.
Readers:git ls-files -z supplies only tracked file paths;test reads their bytes,
skips binary/NUL/non-UTF8 content,and passes text to pure offline-secret-scan.
Served dashboard files and courthouse-tab.js get process.env/provider rules with
no synthetic exemptions. drive-uploader.js is not a served browser file.
Pure scanner has no filesystem/network/clock. Returned diagnostics contain ONLY
file,line,rule;no value,excerpt or hash. Existing full-suite CI executes this new
test before a merge;no new workflow permissions/dependencies/services.

Detector families:private-key/cloud/Google/GitHub/provider/Twilio/JWT/password
URLs/Sentry/bearer and high-entropy credential assignments. Assignment identifiers
include camelCase. Quotes inside expressions are not variable assignments.
Known public ledger/queue/storage coordinates are not authentication assignments;
provider detection still applies to their values. This is a conservative heuristic
gate,not a whole-history audit or a guarantee against every encoding/obfuscation.

Tests allow only word-like fake credentials or a same-line explicit
synthetic-secret-fixture marker. Realistic unmarked provider tokens fail even in
tests;no blanket test-directory exemption. Four existing synthetic data lines get
markers:county appraisal213,public-record browser39,serper diagnostics7,server
free-board102. These are annotations only,no assertion/value behavior change.

## Negatives And Gates

In-memory temporary forged provider fixtures fail with value-free coordinates;
word-like fixtures pass;explicit markers never exempt served files. Each detector
family,camelCase/quoted JSON assignment,pure clock/network spy,determinism and
escaped-expression false positives covered. Git ignore checks cover env/key files
and keep .env.example trackable;Docker expected private-path list asserted.
Focused gate passes current tracked source. Full262/600s-file,review,current-head
and automatic deployment/read-only verification still required;NOT released yet.
No real key/file/upload/secret scan outside tracked source/provider request used.

## Operator Boundary

The issue asks Gabriel,not Codex,to enable GitHub Secret Protection and Push
protection in repository Advanced Security. No repo setting changed here.
Rotation remains after the first closed deal per owner;no new rotation request.
454 scoped-key/local uploader follows this hardening;455/456 remain deferred.
