# Today/JV release failed live ordering

PR #291, application merge `3a0d59e`, Railway succeeded. Health returned 200.
The fully hydrated authenticated home DOM reported:

```
content.firstElementChild.id = "wos-public-deals"
todayPanelCount = 1
```

Today's Deals rendered below the old source desk, not first as required. Existing
`dashboard/wos-public-deals.js:2607` inserts its section before the first child.
The component proof did not run that mounting path. The release is reverted;
[#292](https://github.com/GabrielMontealegre/wholesaleos-bot/issues/292) tracks repair.

[Actual empty Today tab](today-empty-1366.png) shows 0 submitted / 0 vetted / 0 JV.
[Phone capture](today-empty-400.png) shows the same actual counts with no page overflow.
The screenshot contains no property, owner, phone, email or mailing details.
It records the failed release, not an active completed feature. Original synthetic
card/screens and 127-test durations remain in PR #291's branch. No production
import, approval, evidence confirmation, contact, acquisition or batch was run.

The first rollback suite was 123 passed / 1 failed / 0 skipped. The unchanged
date test constructed "ambiguous" text from today + 3 days; after local midnight
that became `10/10/2026`, which has one valid reading. Only the incidental raw
fixture was replaced with fixed `10/09/2026`; null expectations and all product
date rules stayed unchanged. Focused test passed; final rerun durations are in
`docs/test-results/issue-283-rollback.txt`.
