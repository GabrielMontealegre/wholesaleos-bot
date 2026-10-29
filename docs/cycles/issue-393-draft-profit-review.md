# Private Profit Beside Email Review

The owner sees exactly the same source-backed pending profit projection
as the deal/buyer match cards. It appears below the recipient message,
explicitly labeled private and not included in the email.

Trace: pending report writer -> match-profit read DTO -> buyer-messages
prepare -> owner profit_review metadata -> buyer emailPanel. The existing
preview hash also covers this metadata. Draft save/send already re-prepare
and compare that hash, so changes to reported prices/costs cannot silently
reuse an older review. No new financial input or send route is introduced.
SMTP continues to receive only explicit to/subject/body/message_id fields;
private metadata never enters the recipient body or SMTP payload.

The signed-interest, availability, exact buyer, reviewed comps, published
recipient, explicit approval and send gates remain unchanged. No estimate
or proof of funds is invented. Existing saved drafts with a different
version require a fresh preview instead of silently passing review.

New pure tests use the real signed-JV fixture, compare card/buyer/draft DTOs,
prove identical body/to/subject with and without reports, changed-price
version invalidation, absent-report unknowns and client metadata refusal.
New actual-dashboard proof at1366/400/412 allows only fixture preview POSTs,
blocks save/send and external calls, and checks the private/recipient split.
No existing test assertion was changed. Full cloud suite required before
release. No production preview, save, send or evidence action is authorized.
