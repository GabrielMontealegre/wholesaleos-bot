# Cycle 31: Secure Login and One-Click Local Comp Capture

## What Gabriel sees

WholesaleOS keeps the same four-digit keypad. After a correct sign-in, the server gives the browser a signed session that normally lasts 14 days. Reloading the page does not ask for the PIN again while that session remains valid. The PIN is never stored in the browser. The new **Sign out** button ends the session immediately and returns to the keypad.

The main Dashboard's Manual Evidence Packet now shows **Computer helper: Connected / Not running**. Complete, source-supported property rows also show a source selector and **Capture sold comps for this row**. Partial addresses and sale-venue addresses cannot use that button.

## Start the helper

1. In File Explorer, open the WholesaleOS project folder, then open the `scripts` folder.
2. Double-click `Start-WholesaleOS-Helper.cmd`.
3. Leave the small black window open. It tells you that the helper is ready.
4. Open WholesaleOS and sign in normally.
5. In the Manual Evidence Packet, click **Pair helper** once. The helper receives a restricted, expiring token. It never receives or stores the dashboard PIN.

Pairing is normally needed once every 30 days, after signing out and revoking helper access, or when the helper reports that pairing expired.

## Capture one property

1. Choose a property card whose Address status is `complete_source_address`.
2. Choose Zillow, Redfin, or Realtor.com.
3. Click **Capture sold comps for this row**.
4. A visible browser opens on this computer. The helper processes only that row, at human speed, and stops on a block, sign-in wall, CAPTCHA, HTTP 403/429, or unknown page.
5. Return to the card. Any accepted screenshots appear as **UNCONFIRMED OCR PROPOSAL** items.
6. Compare every proposed address, sold price, and sold date with the screenshot and source page. Confirm only what is visibly correct.

Nothing opens during dashboard load or status polling. Nothing is captured until the Capture button is clicked. Nothing is confirmed automatically. Three operator-confirmed sold comps must still pass the unchanged strict comp grid before **Can value** becomes YES. **Ready to offer** remains NO or UNKNOWN until every separate requirement is satisfied.

## Security boundaries

- A typed `x-user-id` value no longer authenticates any protected route.
- Dashboard sessions are signed, expire, renew only after authenticated activity, and live in a Secure, HttpOnly, SameSite=Strict cookie.
- The local helper can read the deal-board row and upload manual evidence only. It cannot manage users, record contact outcomes, clear document review, or change credentials.
- The Railway server never opens Zillow, Redfin, or Realtor.com for this workflow.
- The previous ScraperAPI fallback credential was removed. With no configured provider credential, those legacy paths make no request and report `SCRAPING_DISABLED_NO_CREDENTIAL`.
- Removing the exposed credential from current code does not remove it from Git history. The account owner must rotate or revoke it at the provider separately.

## Honest launch result

This cycle makes the first real comp attempt operational, but it cannot guarantee that a listing site will show usable sold cards. A zero-comp result or a block is valid. The software must report it instead of loosening the grid, inventing a field, bypassing access controls, or silently using paid data.
