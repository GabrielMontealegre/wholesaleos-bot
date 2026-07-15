---
market: Detroit / Wayne County
state: MI
status: live
pr: "#103"
main_sha: 5aa1505
blocker: none
---

# Cycle 2 - Detroit Land Bank

## Verdict Summary

Detroit passed the render gate on `buildingdetroit.org` and shipped a preview-only public inventory lane.
The lane uses the source's public JSON inventory and preserves addresses, displayed prices, property type,
detail links, and visible date evidence. Displayed price is evidence only, not ARV or MAO.

Evidence links:

- `../../exports/cycle2-detroit-gate/buildingdetroit-cards.png`
- `../../exports/cycle2-detroit-gate/buildingdetroit-ownitnow.png`
- [[../WHOLESALEOS_OPERATOR_MAP|Operator blocker table]]

Related notes:

- [[cycle-0-multi-market]]
- [[cycle-3-jefferson-al]]

## Verbatim Codex Prompt

```text
/wholesaleos build

BRANCH: feat/cycle-2-detroit-land-bank (base: main fe715fb)

MISSION STEP: Cycle 2 - Wayne County MI / Detroit. Cycle 1 outcome to
record in docs (WHOLESALEOS_OPERATOR_MAP blocked table): Cuyahoga OH =
'county_network_unreachable_from_automated_vantages_recheck_monthly'.
Also note Wayne treasurer tax auction (waynecountytreasurermi.com) as
a SEASONAL future lane (lists post Sept-Oct) and waynecountymi.gov as
Access-Denied-to-automation.

STEP 1 - RENDER GATE (mandatory, Playwright public page, normal UA,
no login/captcha/paywall interaction of any kind):
  Load https://buildingdetroit.org/properties/ and
  /properties/ownitnow in headless Chromium. PASS = property cards
  render with address + price + detail links without solving any
  challenge; also record (read-only, from the page's own network
  traffic) whether a public JSON endpoint serves the listings.
  FAIL (challenge wall or no rows) = STOP, record probe evidence,
  mark market blocked honestly, and report so the mission advances
  to Cycle 3 (Jefferson County AL) instead.
```
