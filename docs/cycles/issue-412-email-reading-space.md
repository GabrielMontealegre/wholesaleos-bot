# Email reading space

Gabriel's annotated screenshot rejects the excess top whitespace and the
stacked conversation header. This bounded correction stays on the existing
shared design system. It does not start the Deals screen or imply sign-off.

## Trace

- workspace/app.js writes the shell and hover-help area. Email alone gets a
  compact shell with native hover titles and no reserved blank help row.
  Today retains its existing help behavior.
- workspace/email-screen.js writes the existing folders, selected conversation,
  source status and reader. Only header grouping and a status importance marker
  change. Current loading/error/unavailable-reference state controls that marker;
  no stored field, source text or message transport changes.
- workspace/design-system.css reads these view classes. Desktop groups the Back
  icon, subject/role and actions. Phone reading mode retains folders but shows
  category tabs again when Back returns to the list. Errors/loading stay visible.
- index.html cache versions advance for the changed assets. No server, auth,
  mailbox, proposal, recipient or sending module is edited.

## Proof

Synthetic fixtures only, no real mailbox content. The owner screenshot is not
copied into the repo because it contains private contact information.

| Width | Old reader top | New reader top | Extra reading height |
| --- | --- | --- | --- |
| 1366 | 345px | 195px | 150px |
| 400 | 405px | 220px | 185px |
| 412 | 405px | 220px | 185px |

The full pane is573px desktop and695px phone for the synthetic short subject;
long-subject tests require at least450px desktop/550px phone. Full text remains
scrollable in the existing thread pane, with no nested body scrollbox.

Screenshots and machine-readable measurements:
docs/screens/2026-10-21-email-reading-space/before and /after.
Reproduce with WOS_EMAIL_PROOF_DIR selecting a workspace output directory and
node scripts/verify-native-email.js --screenshots. Optional WOS_LIGHTHOUSE_PATH
uses an already-installed Lighthouse module; no repo dependency is added.

Added assertions cover blank-strip removal, hover without layout movement,
long subjects, readable height, bottom-of-message visibility, Back titles,
phone category restoration and visible errors. Existing tests retain escaped
source text, read failures, local-only drafts, disabled Send, session loss,
late-response cancellation and zero writes/external requests.

Synthetic first contentful paint42.4/43.3/44.4ms at1366/400/412. Lighthouse13.5.0
accessibility98 desktop and100 phone. These are local fixture results, not live
provider/mailbox measurements. Focused checks pass; full hosted gate and exact-source live verification are
pending. Keep draft while Railway423 prevents ordered release verification.
No send, real draft, production write, capture or confirmation was performed.
