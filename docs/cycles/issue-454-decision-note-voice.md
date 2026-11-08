# 454 Per-Card Note Voice - Local / Blocked

Handoff: https://github.com/GabrielMontealegre/wholesaleos-bot/issues/504
Frozen runtime/proof candidate37c36f29630adf09a36d6c293dc3eb919cead0d5.

## Independent Scope and Trace

From fetched origin/main f2294a7, with owned proof/docs only. No blocked batch
77608f7, board projection, or 455 runtime/tests carried. Owner454 comment
6632655933 requests voice on notes using browser capability with typing fallback.

Writer/reader chain: decision-desk.js renders textarea[data-decision-note] with
maxlength2000; assistant-sheet.js input listener updates the unsent notes Map.
Its existing explicit single-answer choice action later reads that note. The
batch/Submit change remains blocked502; this slice does not claim to meet it.
wos-local-voice.js already supplies local-only recognition, installed-language
check, final-text-only input events, maxlength, ownership cancellation and local
read aloud. Classic allowlist and preview Ask-only allowlist both omitted these
notes. Add only the note selector to each, sharing an exported preview selector.
Advance the two actual HTML asset references4->5. No existing test guard refers
to that version; no test assertions changed. No controller, auth, route, provider,
writer, storage, draft persistence, stage or money changes.

Language availability is checked only after explicit microphone click, with
processLocally:true. No prefixed/cloud fallback, audio upload, pack installation
or remote TTS. Dictation never chooses an option or submits an answer. It does
not create or assert persisted from_voice provenance. Unsupported local language
retains the existing typing fallback. Existing readonly/busy behavior remains.

## New Synthetic Proof

assistant-decision-note-voice.test.js exercises actual sheet/model/Desk and
shared voice assets, not a copied note handler. Generated in-memory snapshot,
mock responses and recognition only; no real files, imports, microphone, mail,
production JSON, provider or stored business writes. Only after explicit choice
does the mocked answer request contain the exact dictation-derived note.

First new test passed1366/400/412 Tokyo. First images exposed missing UTF-8 and
icons in the test page, not a diagnosed production defect. Initial three images
retained outside Git at .wholesaleos-release-proof/454-note-first-images.
Corrected fixture supplies charset and actual vendored Lucide assets, checks
image completion, and captures whole first card. Changed-fixture test PASS again:
no start/language check on load, final versus interim text, actual notes Map tab
retention, no duplicate controls, removed-target abort, no-language fallback,
exact explicit answer payload, local flags,44px and no horizontal overflow.
All three final images inspected at docs/screens/2026-11-08-decision-note-voice/.
Existing local-voice.test.js PASS unchanged. Positive synthetic proof is not a
signed-dashboard, actual-microphone, production or full-gate acceptance claim.

## Required Gate Failure

FIRST existing local-voice-ui.test.js on this changed slice naturally exited1,
wall2.9361919s. ERR_NETWORK_ACCESS_DENIED during page.goto at15:112. Raw log:
.wholesaleos-release-proof/454-note-voice-first-existing-ui.txt. Cause UNPROVEN;
no environment attribution or browser/network/security change. Same required
file failed in retained prior device and batch full gates. D065c: BLOCK this
slice, no unchanged retry, bypass, cancellation, skip or waiver. Full suite,
hosted CI, push, PR, merge, deployment and production proof NOT RUN.

Architect question: one bounded diagnostic/correction decision for the repeated
existing voice UI gate while preserving original assertions, local-only speech
and all safety boundaries. Do not waive the failure or authorize generic retries,
provider/auth transfer, real audio, uploads or production business actions.

Preserve the branch; never carry this runtime/test into an independent release.
Whole454/455/487 and backlog remain incomplete.
