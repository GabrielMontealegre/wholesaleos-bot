# Issue 392: Legacy Contract Safety

## Trace

- `modules/contracts.js` was the only legacy field builder. It read record
  address/offer/category and other analysis fields, used personal fallback
  constants, clock dates, percentage deposits and an AI review. None of the
  previous literal personal values are reproduced in this note or test fixtures.
- `server.js` registered the only `fillContract` caller: POST
  `/api/contracts/fill`, with leadId/sellerName/titleCompany/extraNotes. It read
  `db.getLeads()` and returned a response; no record write is needed.
- `generateContractText`, `detectState` and `GABRIEL` have no other repository
  JavaScript callers. Their export names remain compatible, but unsupported
  legal defaults and the old legal boilerplate do not survive as signing output.
- The separate `modules/contract_templates.js` library is served by the
  `/api/contracts/templates` GET routes. It is not a caller of this legacy
  builder and is unchanged. No dashboard legacy-fill consumer was found.
- Profile storage and canonical reviewed JV/template/email consumers are
  separate D-059 boundaries. No profile reader is added here. No persistent
  field, ingestion normalizer, valuation gate or stored deal is changed.

## Bounded Repair

- Pure field worksheet, no imports/AI/provider/environment/clock/writes/logs.
  Retains the response field names plus explicit unsigned/review-required
  metadata. Only actual record address/strict positive offer and explicitly
  supplied seller/title/notes are carried. Missing/ambiguous offers stay blank;
  no zero fallback, percentage deposit or rounding of over-precise offers.
- Buyer identity, dates, jurisdiction, deposit and inspection terms remain
  blank. Current route inputs supply no reviewed authority for those terms.
  Signature/profile/deposit/date request extensions are rejected, not consumed.
  Deposit policy: buyer-funded at assignment or blank; never the operator.
- Compatibility text output is visibly an unsigned field-review worksheet,
  not legal approval, a signed instrument or the old contract boilerplate.
- Existing admin guard runs before body validation/record lookup. Allowlisted,
  bounded primitive inputs; unique exact record ID, no first-duplicate guess;
  no-store responses and generic value-free failure codes. No provider call or
  database write path is present.

## Tests And Gates

- New pure test executes the actual module in a VM that throws on require,
  environment access, clock, fetch, logging and timers. Missing/ambiguous dates,
  absent/invalid/over-precise offer, unreviewed profile, forged signature,
  operator deposit, accessor/inherited input and immutable record cases.
- New synthetic loopback route test: unauthorized/non-admin before reads,
  malformed/unknown/oversized/profile/signature/date/deposit requests, positive
  fields, missing and duplicate IDs, no writes, no-store and generic failure.
- Both focused tests pass in the established hermetic runtime. The first route
  invocation lacked the existing secondary NODE_PATH (express unavailable);
  corrected runtime then hit restricted loopback execution. Established
  escalated hermetic loopback run passed, with no product correction for those
  runtime failures. No existing test assertion changed.
- Full candidate/main suites, current-head self-review, exact automatic deploy
  and read-only release verification are PENDING. Not released or DONE.
- Backend-only; no UI changes or new UI performance/screenshot claim. No real
  contract generation, production POST, profile read, private file or business
  write during verification. Positive content proof is synthetic only.
