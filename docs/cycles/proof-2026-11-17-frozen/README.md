# Frozen Slice Release Ledger

All eight frozen slices shipped in D-067c order on 2026-11-17 after the owner's
Claude engineer handoff. B-25 #509 and handoff #512 landed first. No unchanged
CI retry, red merge, assertion waiver, cancellation or failed-result relabeling
was used. First heads passed; later stack heads include their predecessors and
each have one hosted gate. Each child merged only after its predecessor's
automatic deployment and bounded public verification succeeded.

| Item / PR | Tested head | Merge | Hosted run | Passed / Failed / Skipped | Automatic deployment |
| --- | --- | --- | --- | --- | --- |
| #495 / #514 | c1a408c | 70b43a9 | 44141561891 | 306 / 0 / 0 | 7861969164 |
| #496 / #515 | 8a13795 | 5697c8c | 44145531869 | 307 / 0 / 0 | 7862553536 |
| #497 / #516 | b86fa9e | 401a76c | 44146079622 | 308 / 0 / 0 | 7862612605 |
| #498 / #518 | 7123a99 | 562cf41 | 44146201502 | 310 / 0 / 0 | 7862709212 |
| #501 / #519 | 4139f76 | 7ce353d | 44146222613 | 312 / 0 / 0 | 7862760477 |
| #502 / #520 | 4f0dfc7 | 02ddd16 | 44146239601 | 313 / 0 / 0 | 7862820653 |
| #504 / #521 | 617cfad | 66ed9b8 | 44146483679 | 314 / 0 / 0 | 7862857512 |
| #505 / #522 | 37b3764 | 717d648 | 44146609232 | 315 / 0 / 0 | 7862917202 |

Runs are under `https://github.com/GabrielMontealegre/wholesaleos-bot/actions/runs/`.
The adjacent `{PR}-public-get.json` records contain full source identities and
fixed-route results. Full first/integration test artifacts are retained locally
under the workspace's `.wholesaleos-release-proof/{PR}-{first,integration}-hosted/`.
Original frozen failure files remain committed and unchanged.

## Verification Boundary

Every automatic deployment reported success for its exact merge. Public health
returned 200; dashboard/app static bodies matched the merged Git source. Changed
public scripts also matched. Unauthenticated device requests returned 401; the
template release also checked its unauthenticated template endpoint returned 401.
No private response body, length, hash, credentials, cookies, accessibility tree
or production screenshot was read. No authenticated component inspection was
performed. No production import, answer, revocation, microphone, message, provider
or business write was used as verification.

Synthetic screenshot and component tests cover 1366/400/412 widths for device,
template, JV/profit, active age filter, source labels and decision-note voice.
Their existing images were inspected. The age-filter phone table/toast clipping
is retained baseline debt, not claimed fixed. Pure batch/preflight changes have
no UI or production writer wiring. Paid execution remains always disabled.

Only #501's two duplicate cache assertions changed from 57 to 58, preserving both
assertions and messages under explicit D-067c authority. Provenance, source dates,
auth, money, signing, default-OFF mail writers and no-send gates remain intact.
This completes these eight slices, not the full #454/#455/#494/backlog scope.
