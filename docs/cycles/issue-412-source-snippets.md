# D-063 B: Source-Backed Snippets

One read-only slice,not whole mailbox migration. No automatic IMAP body-preview
batch,provider writer,stored cache,auth/send/API route change or new CSS.

## Writer / Reader Trace

- mailbox-reader OAuth metadata already returns provider snippet;new
  snippet_origin=gmail_provider_snippet only for actual nonempty bounded safe
  provider text. No invented subject/fallback preview. Missing/malformed/over4KB
  UTF-8 provider text has null origin and is withheld.
- IMAP metadata still reads envelopes/flags only,never bodies. Explicit existing
  message()/messages() parse paths add body_origin=parsed_mime_text only from
  actual nonempty safe parsed text under the existing2MB cap. Displayed fallback
  bodies remain compatible but have null origin. A real source literal equal
  to the fallback can be distinguished because origin is set at the writer.
- registerMailboxReads -> thread-view.annotate spreads these fields through
  existing signed-admin/no-store GETs. Metadata max50/body max30/8MB thread caps,
  UIDVALIDITY,read-only locks,logger suppression and provider requests unchanged.
- mail-layout-model validates exact id/date/from/to/cc/subject/direction/RFC
  anchor/threadId identity,source and injected current time before deriving a
  whitespace-collapsed500-character opened-body excerpt. Unknown/conflicting/
  forged/stale/malformed/oversize sources are withheld,not promoted to facts.
- email-screen retains only that excerpt plus identity in a private Map AFTER
  a current explicit open() response. Back can show it without another request.
  Reopen clears prior candidate first;refresh/folder/search/category/role/401/
  destroy clear the Map. Existing request tickets reject obsolete responses.
  Drafts never supply previews. Nothing goes to storage,logs or a new endpoint.
- The existing escaped subject/snippet renderer and bounded loaded-mail
  projection consume it. Unopened IMAP messages remain without snippets.
  Search changes clear opened excerpts;this does not claim global/body search.
  Classic provider snippets remain compatible;new IMAP excerpts are native
  session-local only. Notifications/business records are unrelated,untouched.

## Tests / Assertion Changes

New hermetic adapter/MIME/annotation/projection tests:body and provider origins,
literal-vs-fallback distinction,unknown/invalid/multibyte-size/forged/wrong-ID/
wrong-source/date/identity/conflict negatives,pure clock/network refusal and
unchanged metadata/header/body read counts.
New actual-app1366/400/412 test uses those real adapter fixtures:zero unopened
body reads,Back preview without request,escaped markup,draft isolation,search/
category/folder/refresh/late-response/401 clearing,exact request counts and no
storage/writes/external/errors. New category test first exposed the separate
tab-select cleanup path;fixed product instead of weakening the assertion.

Existing assertion intent unchanged. mail-layout-model.test.js row scaffolding
adds actual provider origin to the existing sourced-preview positive fixture;
all search/conflict/missing/purity assertions remain. Visual harness baseline
updates d78f77f -> current74dfd39 and includes both models;current main uses
category tabs,so the before view explicitly selects its existing Buyers tab
before waiting for its buyer fixture. Reading/containment thresholds unchanged.
Both --layout/--reply and proof-directory options retained. Cache layout-model
v2/Emailv11;CSSv10/componentsv5/navv2/replyv1/todaymodelv1/appv7 unchanged.

## Proof / Scope

Pinned synthetic behavior screenshots distinguish before explicit open versus
after Back,not old-source versus live results. Separate exact prior-main app
baseline/current candidate1366/400/412 reading proof:FCP51.5/49.1/27.5ms,
reader645/740/740px,Lighthouse13.5.0 accessibility98/98,zero external/writes/errors.
These are SYNTHETIC,not authenticated phone timing or full Gmail acceptance.
No controls/layout changed;original five-size rail/composer and loading suites
pass. Full final-head gate and exact deployment/read-only proof still pending.

Official source contracts checked2026-10-25:
https://imapflow.com/docs/guides/fetching-messages/ (BODY.PEEK,encoded partials,
no nested commands inside fetch iteration)
https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
(provider snippet is message text,not an authoritative total).
No new provider operation depends on an assumed library behavior.

Remaining D-063B:unopened IMAP previews if separately bounded,attachment
manifests,folder totals,cursors,labels/search. C/default-OFF boundaries unchanged;
no production Preview/Send,typed draft,settings,credentials or business writes.
