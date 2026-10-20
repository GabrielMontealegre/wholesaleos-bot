# Native Email: Category Switch During Initial Load

2026-10-20 live release verification FAILED after the initial layout checks.
PR417 merge a5b3cca723a805f00614440cf8e0912fdf131331 deployed as Railway
7212445984 at22:20:46Z after the provider recovered. Health200 and the new
asset200 were confirmed22:21Z. Normal hydrated Inbox/Sent, reading, local
Reply, disabled Send, X/Back and1366/400/412 layouts worked;0 console errors.

Negative case found during the412px screenshot reload: selecting Alerts
while the initial folder request is in flight changes the status to
"Latest 0 messages in this folder", aria-busy false. The request is ignored
instead of rendering into the newly selected category. An independent Sent
read immediately afterwards returns30 messages/29 conversations. This is
not an empty mailbox or a server failure. No identities are in this report.

Trace: email-screen.js load() increments the shared sequence and starts the
metadata request. paint()'s category select() increments the same sequence,
sets busy=false and never restarts the metadata read. The late metadata
response is therefore discarded. Body requests need cancellation, but a
category projection change must not invalidate the current folder load.

Required narrow fix: distinct request ownership for folder metadata versus
body selection, or an equally deterministic equivalent. Keep category
selection, preserve its loading status, and render the same outstanding
metadata response without duplicate requests. A folder switch must still
discard an obsolete folder response; Back/category must still cancel body
reads;401 must still clear all private state even if a read is pending.

Add a delayed-metadata hermetic test: click Alerts before releasing metadata,
then receive the original response; expected nonzero total, correct Alerts
projection and one list request. Include empty/failure and401 cases. Retain
all existing assertions and safety gates. No API/auth/backend/send changes.

Per AGENTS7, revert the failing merge, deploy the last verified product tree,
then fix in a separate bounded PR with focused/full tests and live checks.
Do not claim PR417 verified DONE or begin dependent D-061 transport yet.
No send, typed draft, Gmail handoff, capture, batch or business write occurred.
