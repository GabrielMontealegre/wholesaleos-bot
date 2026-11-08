# Device Labels: Failed First Local Gate

Frozen source:08b59b7a214a09ebbaca108f326f5c3f68a967cb.
First full suite:209 passed,97 failed,0 skipped of306,600s/file.
Every root test has exactly one timing row in first-local-full.json, validated
against the frozen Git tree and terminal SUMMARY. Duration sum is not wall time.
Raw log retained outside Git at .wholesaleos-release-proof/455-device-08b59b7-first-full.txt.

Existing remembered-device-ui failed61.08s at startup52:5 before requests,
matching its first focused failure. Cause unproven. New device-time-labels
component test passed2.22s; this does not waive the failed full gate.
Slice BLOCKED / needs-architect, no unchanged retry or release.

## Architect Question

What bounded real fix should address the repeated signed-device fixture startup
failure while preserving every auth/session/TTL assertion and safety invariant?
Recommendation: review fixture startup and failure observability with synthetic
metadata only. Do not replace signed-server coverage with component coverage,
expose child credentials/logs, attribute failures without evidence, or retry the
unchanged head. Other96 failures are retained, not diagnosed or waived here.
