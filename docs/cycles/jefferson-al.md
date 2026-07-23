---
market: Jefferson County / Birmingham
state: AL
status: blocked
pr: none
main_sha: 5aa1505
blocker: jefferson_al_tax_lien_sources_blocked_from_automated_vantages
---

# Jefferson County AL Market Note

Current cycle: [[cycle-3-jefferson-al]].

Do not add an AL lane until a property-row source is verified open. Current evidence shows:

- `jccal.org` tax-delinquent pages return Cloudflare/429 to headless Chromium.
- `taxlien.jccal.org` embed endpoints return 403.
- AlabamaPublicNotices.com is readable as a search portal, but Jefferson property-address detail rows were not verified as open in Cycle 3.

Evidence:

- `../../exports/cycle3-jefferson-al-gate/probe-results.json`
- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]

Next recheck target:

- AlabamaPublicNotices.com Jefferson foreclosure/lien-sale detail path.
- Jefferson County tax-lien embed after a monthly recheck.
