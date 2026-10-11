# Signed-document re-review - #307

When signed holder terms change, the full package correctly locks. The JV card
now offers Re-review signed documents. Review each actual signing requirement,
enter the date printed on the signed agreement, current contract/JV document
URLs, the actual review time and evidence text, then Save signed-document review.

This does not sign, contact, send or advance a deal. The original signing event
stays intact. A new review appends separately with the authenticated operator,
source evidence, times and the current terms snapshot. Changing the terms again
locks the package again. A stale card cannot attest new terms it has not shown.
The package still separately requires current approval, value and buyer guards.

## Trace and gates

- Signing/date/terms writers: canonical stage POST, sourced deal-update/terms
  PATCH, existing imports. All retain original stage and review arrays.
- New admin POST `/:id/jv-signature-review` reads the current store, evaluates
  status, invokes pure `recordSignatureReview`, then performs one store write.
- `jv_signature_reviews` -> `reviews` integrity/chronology checks -> latest
  signature/current-terms comparison -> view/fullPackage -> dashboard card.
- `review_version` fingerprints terms, stage/review history, approval and legacy
  status; the server rejects outdated/replayed requests. It proves no fact.
- Raw date, source, all signing checks and complete holder terms are required;
  no legacy label or derived signing date alone can unlock anything.
- Malformed reviews lock; historical reviews are not silently deleted/replaced.
- Dashboard JV2/Today7: explicit form, no prefilled action time/checked claims;
  inline errors preserve input; current card reload after success.

New tests pin missing/original-signing/stale/replayed/forged/ambiguous/future/
wrong-origin/date-only/terms-snapshot errors, purity, persistence, unchanged
lead/buyer collections, same stage and append-only original signing history.
Real local routes/UI additionally prove401/400/409/413, all signing checks,
one successful append, reload and desktop1366/400/412 with44px controls/no
overflow. Checklist legend contrast is pinned to the current theme.
Existing assertions unchanged; source/comp/contact/auth/server/dependencies
unchanged. Synthetic screenshots are not production evidence.

The initial full run had155 passes/1 failure: the earlier stage UI proof raced
its terms-save reload. It passed isolated. Its wait checked an input value
already typed by the fixture, not completion; synchronization now awaits the
actual PATCH200 and the refreshed empty evidence field. No previous assertion
was removed/weakened. The initial timing/failure log is preserved alongside
the final full run rather than hidden.

Full-suite and exact deployment verification are recorded in BACKLOG.
Next #307 work is email templates/approvals, then reversible lead triage.
