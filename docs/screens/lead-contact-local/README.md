# Saved-Lead Contact Proof

All data is synthetic (`synthetic: true` fixture rows). No production database,
credentials, real contact, provider, import or business operation was used.

Run: `node scripts/verify-lead-contact-ui.js` with the repository dependencies.
The script serves the actual dashboard in an isolated loopback Express fixture,
registers the real contact-tap route with a synthetic store, blocks external HTTP,
and substitutes only the native phone/Messages navigation adapter. It does not
launch a real app or claim a call/text was completed.

- Drawer: `synthetic-contact-1366.png`, `synthetic-contact-400.png`, `synthetic-contact-412.png`.
- Operational card: `synthetic-operational-1366.png`, `synthetic-operational-400.png`, `synthetic-operational-412.png`.
- Also tested at360px (no additional screenshot required).
- Owner/phone and44px actions visible, source metadata closed, address not duplicated.
- Edited SMS stays on device; only canonical tap metadata is posted.
- Real admin route logs who/when/number as a request, not a completed contact.
- Missing/rejected/possible phone, bank/government owner and missing owner deny actions.
- Duplicate/stale/forged requests,401/403,429/no retry, timeout and late auth clearing tested.
- Lead facts/status/reference unchanged; only explicit synthetic tap activity writes.
- Non-admin behavior and public-source preview remain unchanged pending #543 approval.

This proves the saved-admin slice only. Full B-27 is not DONE.
