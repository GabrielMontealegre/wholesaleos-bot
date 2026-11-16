# PR477 Rebased Synthetic Screens

Four changed views at1366x768,400x915 and412x915: Approvals, Pipeline,
Conversations and Notifications Work queue. All content is supplied by the
existing local synthetic fixture; no production session, files or provider.

The first existing functional test passed all twelve cases. Its Conversation
captures were belowfold and are retained externally, not used here. The test
now asserts its heading is in the viewport. A bounded three-case Conversation
capture supplied those three positive images; the other nine inspected positive
images were not recaptured. Runtime files remained byte-identical throughout.
All twelve selected images were inspected and copied byte-identically, with
SHA256 manifest. Geometry proof contains synthetic rectangles only.

Source codes embedded in reported text remain escaped and visible. Standalone
reference metadata alone is removed. Exact IDs/links, disabled unchecked source
review, no guessed link, counts, provenance and no-write gates remain.
No new Lighthouse/performance/15-case audit or speed claim. D065b's accepted
historical baseline comparison is recorded in the item trace; its layout debt
is a separate bottom-of-backlog follow-up. Full current-head CI remains pending.
