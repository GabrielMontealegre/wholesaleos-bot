# D-063 B: Explicit-Reader Attachment Metadata

Bounded read-only slice: source-backed metadata after an existing explicit
message/thread open. No unopened-list paperclips,attachment download API,new
provider operation,stored cache,send path or CSS layer. Nothing is inferred
from subject/body text. This is not C2 attachment sending or document review.

## Writer / Reader Trace

- Existing mailbox-reader IMAP/OAuth explicit body paths already fetch raw MIME
  under2MB/message,readOnly locks/UIDVALIDITY/body thread limits. simpleParser
  already buffers MIME attachments in server memory. The new pure
  attachment-manifest module selects metadata only from that existing parse;
  it does NOT request/download another attachment or return its content.
- Returned fields are exactly part_index,filename,content_type,size_bytes,
  disposition,related,plus parent attachment_manifest_origin=parsed_mime_metadata.
  No Buffer,base64,checksum,headers,contentId,cid or remote URL is returned.
  Absent/malformed/over50-part arrays produce null/unknown,not0 or a truncated
  fabricated total. Confirmed empty arrays remain known empty.
- Missing/unsafe path/control/bidi/over200char names become null;invalid MIME
  types and missing/noninteger/negative/over2MB sizes become null. Real0 stays0.
  No filename normalization invents a source name. Inline parts stay identified
  as inline rather than being executed or silently relabeled as regular files.
- Existing signed-admin/no-store list/body/thread routes -> thread-view.annotate
  preserve source metadata. Lists still read envelopes/flags ONLY;no manifests
  or speculative body requests. No DB/business writer exists for this data.
- Native mail-layout-model reuses exact metadata/body identity and injected
  clock checks,then validates the complete allowlisted manifest. Wrong IDs,
  source,date,identity,origin,unknown fields or malformed records are withheld.
- email-screen uses the existing shared badge/muted text styles to display
  filenames,reported type,bytes and inline status after source text. Missing
  values are explicit;unknown manifests show nothing,not No attachments/0.
  No file/image/link/button/download is created. Back/category/session clears
  state.body as before;file names are not retained in the snippet Map/storage.
- D-061 reviewed-thread-replies also reads body responses. Its source digest
  explicitly hashes selected identity/participants/text/conversation fields,
  not new manifest fields. Sender still constructs an explicit text-only SMTP
  payload;prepare() rejects an attachments request field. Tests prove both.

## Tests / Changes

Real multipart MIME with regular and inline parts flows through injected IMAP,
OAuth raw body,simpleParser,annotate and pure native projection. Exact request
counts/readOnly flags,no attachment download API,strict returned keys/no buffers,
empty/unknown/sparse/oversize arrays,path/control/bidi/name/type/size/zero/source/
date/identity negatives,pure clock/network checks and unchanged reply digest/
attachment-send refusal pass. File metadata remains available if source text
is genuinely absent;it never fabricates a readable-body preview.

Actual-app1366/400/412 tests verify explicit-open-only metadata,escaped long
filenames,shared-style containment,no content/image/link/command/download,
wrong-identity refusal,unknown fields without0,known-empty suppression and only
explicit body reads. Existing snippet3size and chrome5size tests pass unchanged.
No existing safety assertions weakened. Visual harness baseline changes only
74dfd39 -> current327fd7c;both models,reading/containment thresholds and
--reply/--layout/proof-dir options retained. Layout-modelv3/Emailv12;other
asset versions and CSS remain unchanged.

## Proof / Scope

Real-MIME positive screenshots are SYNTHETIC,not private files or live phones.
Separate prior-main app baseline/current shared reader1366/400/412:
FCP48.8/41.3/26.1ms,reader645/740/740px,Lighthouse13.5.0 app accessibility98/98,
zero external/writes/errors. Not authenticated live timing or a claim that
Lighthouse inspected a real private attachment. Full final-head/live gates pending.

Official MailParser contract checked2026-10-25:
https://nodemailer.com/extras/mailparser -- simpleParser buffers attachments;
filename may be undefined;contentType/disposition/size are metadata;content is
a Buffer. We use metadata only and never render parser HTML or inline content.
No new provider SDK behavior is assumed.

Remaining B:unopened-list attachment presence/manifests if separately bounded,
unopened IMAP previews,folder totals,cursors,labels/search. Parent412 design
approval/nativeDeals gate and C/default-OFF boundaries remain unchanged. No
production sends,typed drafts,attachment opens,settings or business-data writes.
