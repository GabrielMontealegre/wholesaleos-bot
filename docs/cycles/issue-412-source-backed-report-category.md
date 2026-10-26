# D-063B: Native Source-Backed Report Category

2026-10-26 candidate from verified mainf7a7977;not released yet.
453 already supplies source metadata. This slice consumes it without a backend,
provider request,storage,writer,send,auth,CSP,CSS or layout change.

## Writer / Reader Trace

Actual writer is mailbox-reader's capability-gated existing IMAP fetch,validated
by provider-labels.js and carried unchanged through thread-view.annotate and the
existing admin/no-store response. It emits per-message provider_labels.names
with originimap_gmail_labels and scopemessage. REST receipts carry opaque ids,
NOT names. No new mapping/registry request is added here.

email-model validates source/date/identity and groups unique message IDs.
mail-layout-model formerly classified Reports from an unproven raw labels field
that the actual mailbox adapter never emitted. Its new internal projection
accepts only own primitive fields in the IMAP per-message receipt. Dense unique
arrays,max100 names/200characters,control/bidi rejection,exact name matching and
no accessors/coercion keep malformed receipts unknown. Raw labels and REST IDs
never prove a Reports name. Report classification requires valid identity and
the SAME receipt on every duplicate copy and a report label on every member;
ordering differences alone are not conflicts. Mixed conversations remain out.
Existing Alerts/recorded-role precedence is unchanged;this is a display category,
not a person role,mailbox mutation or business eligibility gate.

email-screen already calls project() on the current owned metadata snapshot.
No new cache,listener,request,async callback or DOM update path is introduced.
Its existing category/search/folder/refresh/session invalidation still controls
reader/composer/draft/review ownership. Counts still describe loaded projected
conversations,not provider folder totals. Count450 stays blocked/unmodified.

Native index advances layout3->5 and Email12->14,deliberately skipping cached
failed448 layout4/Email13. All other script/style versions are preserved.

## Tests / Assertion Policy

New mail-report-provenance.test.js feeds the ACTUAL reader and annotate through
a synthetic immutable source client. It tests genuine positive report labels,
unsupported capability,REST IDs/raw labels/wrong source/scope,unknown/empty,
sparse/accessor/duplicate/control/bidi/oversize/malformed receipts,invalid/future
identity,conflicting duplicate copies,order independence and mixed members.
Projection never mutates source or uses ambient clock/network/writers.

Existing mail-layout-model.test.js retains every assertion;three raw-label
fixtures become explicit source receipts. workspace-mailbox-chrome.test.js
retains every assertion and replaces its raw report fixture with real adapter+
annotation output via helpers/source-labelled-mail.js. Metadata call count is
asserted;body reads remain forbidden by that helper. These are scaffolding
corrections under AGENTS4,not weakened category/mixed-thread/safety assertions.

Pinned five-size chrome and existing loading/UI/reply/snippet/attachment
regressions pass. The actual Reports positive is synthetic,not a forged or
searched-for production label. No real Preview/Send/draft typing is allowed.

Verification utility verify-native-email.js adds optional exact40hex
WOS_EMAIL_BASELINE_REF,with the old default retained,and records baseline SHA.
Existing --reply/--layout/--screenshots/proof-dir behavior is preserved. This
allows honest before/after against current f7a7977 instead of an old UI source.
Initial synthetic FCP46.7/39.8/30ms,reader645/740/740,Lighthouse98/98;not live
timing or final-head release proof. Full600s/file,self-review,exact deployment
and approved435 mixed proof remain required. No owner design approval claimed.
