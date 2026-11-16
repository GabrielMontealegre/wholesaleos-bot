# Mailbox unread stripe

Owner request, 2026-10-31: remove the vertical blue line through the mailbox
list and continue building. This is independent of blocked PR483/issue485.

## Trace and scope

- Provider read/unread metadata is projected by `email-model.js` and
  `mail-layout-model.js`; those producers and consumers are unchanged.
- `email-screen.js` adds `ws-mail-row--unread` only to projected unread rows.
- `design-system.css` painted a 3px inset blue shadow on each such button.
  Adjacent unread rows therefore appeared as one continuous vertical stripe.
- Remove only that shadow. Keep bold unread senders, normal read senders,
  hover/selected backgrounds, and the shared keyboard focus outline.
- Increment the stylesheet cache version from15 to16. No API, provider,
  storage, authentication, category, label, or writer changes.

## Validation

The added synthetic regression first failed with the actual computed inset
blue shadow, then passed after removal. Fixtures explicitly include unread,
read, and unknown read states. Existing assertions remain unchanged.
The focus assertion uses real Tab/Shift+Tab navigation, not programmatic focus
after a mouse click. The initial focus-scaffolding failure is not a product bug.
Focused Email UI test passes at1366/400/412 widths, including existing reader,
draft preservation, error, session clearing, and zero-write checks.

Full suite and synthetic visual review pending. Not merged or deployed.
The rollback484 remains verified; PR483 remains blocked, cause unknown.
No real message opening, private content probes, screenshots, or writes.
