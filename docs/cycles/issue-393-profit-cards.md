# Source-Backed Potential Profit Cards

Bounded slice of #393, not completion of the offer machine or funds review.

Writer/reader trace:
- `pipeline-reports.validate/upsert` writes immutable pending price ranges,
  explicit path/share, source URL/text/date and exact buyer/deal references.
- `pipeline-reports.project` revalidates stored origin/digest/date/reference
  identity and selects current revisions. `pipeline-report-review.project`
  supplies separate acknowledgment/correction status, never funds evidence.
- `match-profit.build` joins that read projection to one current canonical
  buyer/deal match. It uses `pipeline-money.calculate` unchanged. Multiple
  current reports, invalid history, hidden/closed/flagged rows and future
  evidence produce unknown, never fallback to old prices or a ceiling.
- `reviewed-deals.list` and `buyers/deal-fit-view.build` add the same profit
  DTO. Core `evaluate`, matching/comp/approval/readiness rules, sorting and
  persisted rows are unchanged. No refresh or migration is needed.
- `wos-match-profit` renders the same figures on deal summaries/details,
  matched-buyer disclosures and buyer compact/detail match cards. Sources
  are read-only links, never fetched by the server. No funds verified.

Net fee = reported buyer price minus reported contract price minus total
costs, using range endpoints. Our share requires an explicit fraction.
Asking price, buyer maximum and before-cost spread stay separate. No cost
policy is installed: the malformed assignment default is not guessed.
An injected, explicitly labeled estimate remains supported by the existing
pure calculator. Negative profit remains negative.

New tests exercise exact DTO equality, missing inputs, losses/splits,
conflicts, wrong origins, future reports, terminal/pending/unsigned deals,
corrupt history, correction flags, no funds substitution and zero network,
clock or writes. Synthetic dashboard proof uses1366/400/412, source links,
human dates, unknown states and no external requests/writes. New fixture
scaffolding corrections changed no existing assertion or policy.

Remaining: show the same internal-only profit projection beside owner
draft reviews and bind it to stale-preview checks, without inserting private
cost/net data into an outgoing recipient message. Report reconciliation and
proof-of-funds evidence capture are separate contracts, not invented here.
