# Live reference/activity foundation

[PR #296](https://github.com/GabrielMontealegre/wholesaleos-bot/pull/296), application
merge `172c62411c3acbeeb6c308c80a265fd241ded943`. Railway exact-commit status
success; health 200; record bundle v1, buyer v5, Today v2 served.

Read-only signed-in observations:
- Activity: 39 retained/projected historical events. Approved filter: 26.
- Missing canonical references: 12,039 leads, 30 buyers, 0 reviewed deals.
- City query returned 9 stored-record/buyer results; opening a buyer find selected
  exactly one card and loaded its retained historical timeline.
- Activity and buyer view fit 400/412 with no page overflow; no new release console
  errors. Existing lead list hydrated 12,039 records/100 rows and a card opened.
- Home still begins with Today's Deals. The known broader phone/header issues
  remain #294; they are not claimed fixed.

| View | Desktop | Phone | Android width |
|---|---|---|---|
| Activity controls/count | [1366](activity-1366.png) | [400](activity-400.png) | [412](activity-412.png) |
| Buyer search header | [1366](buyer-search-1366.png) | [400](buyer-search-400.png) | [412](buyer-search-412.png) |
| Unchecked reference control | - | [400](reference-control-400.png) | [412](reference-control-412.png) |

Screens are cropped before real people, contact details and street addresses.
Private history rows were inspected through structural/count checks, not published.
Complete reference/card examples are explicitly synthetic local proofs under
`docs/screens/record-activity-local`, not claimed production inventory.

No assignment POST, import/approval, draft generation, contact, confirmation,
capture, source request, batch or helper action occurred. Canonical old-record
application awaits separately authorized backup/operation in
[#297](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/297). Deployment
and GET did not write references or activity. The 39 events are retained historical
records, not manufactured events from this verification.

Suite: 131 passed / 0 failed / 0 skipped, 600s per-file limits; UI proof 18.97s,
county-notice acquisition 13.17s. No existing assertions weakened. Comp, readiness,
lifecycle, market policy, security and db modules remained unchanged.
