# Clean buyer cards

#325 mockup slice. List: name,areas,one-line buy box,reviewed-deal match badge,
approval/contact status,last contact report,Open buyer. No post IDs,subjects,
contacts,raw notes or action forms on the list. Open preserves full buy box,
published contacts/source/duplicate/trust details,approval,drafts/status controls,
record timeline,matching reviewed deals and near misses; each opens its deal.

Trace: assistant-finds.validate/ingest owns source/profile/buy box/approval/status.
update appends actor/time outreach reports,not actual SMTP proof. Existing
listFinds retains saved-lead fits; an additive pure deal-fit-view computes the
separate reviewed-deal count using reviewed-deals.evaluate and buyer-fit.fitLead.
Canonical price/percent/value/approval/AI/area/terminal rules stay unchanged;
shared evaluation runs once per reviewed deal,not once per buyer/deal pair.
Known budget overage and geography differences become near-miss reasons. Other
hard criteria remain a conservative full-buy-box reason. Check items stay visible.
Only id/ref/city/state/ZIP/price/maximum/checks travel; no JV street address.
Counts precede10-item display caps. Last contact derives only from explicitly
recorded nonfuture outreach history; missing/preset/capture-only stays Unknown.
The module is loaded on call to avoid the existing reviewed-deals/finds cycle.
No write/ingestion/send/contact/comp/auth/source/dependency change.

Existing proof changes: two assistant-buyer-finds assertions call detailedCard
instead of card because source/contact/lead-fit details intentionally move off
the list. Their exact original safety assertions remain. New tests cover the
compact list separately and all original data remains on the open card.
Initial new fixture named SYNTHETIC BUYER was correctly rejected by the existing
anti-test-buyer gate; only the new real-shaped fixture label was corrected,not
the guard. Pure negatives cover pending,value missing,repairs missing,AI,price,
area,terminal/future contact,privacy and no network/write/clock side effects.
Full-index1366/400/412 proves list/open/back/deal navigation and retained controls,
zero writes/external calls. Synthetic screenshots under2026-10-12-clean-buyers.
Initial170/0/0 preserved in issue-325-clean-buyer-cards-initial.txt. Visual review
corrected singular match copy and removed raw source-capture ISO prose. Exact
final SUMMARY passed=170 failed=0 skipped=0 total=170,600s/file; buyerUI7.20s,
pure0.57s,mobile24.59s,wider-area24.10s,county-notice12.76s. Every duration in
issue-325-clean-buyer-cards.txt. Release/live verification pending.
