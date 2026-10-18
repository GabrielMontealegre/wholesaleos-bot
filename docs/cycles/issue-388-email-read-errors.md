# Email Read Failure Diagnostic Slice

An Inbox read can succeed while an individual body fails. The old client
discarded the Inbox and labeled the connection broken for every failure.
This slice keeps the list and last observed status for ordinary body errors.
Known size, stale reference, missing reference, invalid reference and busy
codes get fixed English instructions; unknown errors remain unknown.
Dashboard401/403 still clears private content. No raw provider error renders.

Trace: modules/email/mailbox-reader.js owns bounded read-only IMAP/MIME
and OAuth reads and the safe email_* route codes; untouched. Its list/read
methods and registerMailboxReads are the only mailbox reader routes.
dashboard/wos-email-reader.js request writes status/error/messages/notes/
thread/body/reply; load, renderGmail and folder selection initialize lists;
the selected-message click supplies keepList only for body/thread requests.
markup/statusPanel/threadRows/reading consume that state. Test connection
and folder loads keep their existing behavior. No business writer is added.
dashboard/index.html consumes the reader with cache version5.

New email-read-errors test injects reader errors into the actual route,
verifies no-store/redaction, then exercises the real dashboard at1366/400/412.
It checks known and malicious/prototype-key unknown codes, one read per click,
no retry, retained list, successful subsequent reading, inert Send and private
DOM cleared on401. Network is fixture-only; no provider or write request.
Existing assertions unchanged. The initial new driver expected a visible
alert behind the shared401 login overlay; it now checks attached DOM and
empty private lists, without changing auth or weakening that privacy check.

Full hosted gate and one ordinary live message observation required before
calling this released. The historical live root cause is not yet known;
this slice does not increase size limits, rotate secrets, or claim that the
underlying message became readable. #388 stays open if that remains unknown.
