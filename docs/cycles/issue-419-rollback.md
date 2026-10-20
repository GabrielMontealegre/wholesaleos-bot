Item: #419 -- rollback native Email after a failed live negative case

What changed: revert merge a5b3cca (PR417), restoring the exact previously
verified0d035e0 tree before this checkpoint documentation. No data migration,
API/auth/provider/config change. The classic Email and foundation remain.

Trace: email-screen.js load starts metadata with sequence ticket; category
select increments the same sequence, clears busy, and does not refetch.
The late response is discarded and a nonempty folder falsely reports zero.
Verified live during the412px reload; Sent immediately returns30 messages.
Normal reading/local Reply/layouts and0 console errors did not catch it.

Tests: full235-file cloud suite600s/file required on the rollback head.
Before checkpoint docs, git diff0d035e0...HEAD was empty: exact product and
test restoration, not a new workaround. Reverted assertions/files are only
those added/changed in PR417; existing safety coverage is restored intact.

Decision: AGENTS7 rollback after failed live verification. D-061 remains
approved but dependent on a corrected, live-verified Email migration.

Risk: native Email preview unavailable until its narrow race fix is green.
No stored mail, leads, buyers, activities, drafts or evidence is removed.
No send, capture, batch, confirmation or business write. No billing/settings
change. Feature source, timing/proof and exact trace are preserved in Git
and item/415-reviewed-thread-replies@a4ee381, not silently discarded.

After merge: wait exact deployment, health200, foundation and classic Email,
lead hydration/open/close, bounded read-only checks and privacy-safe proof.
Then fix419 separately; do not mark the feature or parent412 DONE.
