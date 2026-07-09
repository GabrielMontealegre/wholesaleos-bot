# Gabriel's Daily Deal Workflow

This is the step-by-step routine for working the free public deal machine.
Everything below is free, public-source only. Nothing on the board is a saved
lead until YOU decide to save it. The board never fakes an address, a zip, a
date, an owner, a contact, comps, ARV, or MAO — when data is missing it says
so and tells you where to verify it.

Dashboard: https://wholesaleos-bot-production.up.railway.app/dashboard
(log in as your admin user; the "Best Public Deals" section is at the top).

---

## 1. Open the Dashboard

Open the dashboard URL above. The "Best Public Deals" section has three panels:

- **Daily Deal Machine** — is the machine running, and what did it produce today.
- **ZIP Review** — real addresses that need YOU to read the zip from the document.
- **Top Deals** — the rows worth your time right now, best first.

## 2. Check the Daily Deal Machine panel

Look at the top panel first. Green border = auto-run is ON. Red border = OFF.

Read the chips left to right:
- **AUTO-RUN** — ON with the interval, or OFF with instructions.
- **Next run** — minutes until the next automatic batch.
- **Runs today** — e.g. `5/24` (it stops at 24 per day by itself).
- **Batches today / New rows today / Address rows today / Actionable today / OCR rows today** — what the machine produced since midnight.
- **CALL_READY / ZIP review / INSPECT_NOW / Rows total** — the current queue.

Below the chips: the last batch summary, OCR diagnostics, and **Source blockers**
(counties that are gated by portals, captchas, or IP blocks — those are honest
"can't get it free" reasons, not bugs).

## 3. Turn auto-run ON (if it is off)

Flip the **"Auto-refresh every 20 min"** checkbox at the top of the section.
That runs the batch on the SERVER every 20 minutes, capped at 24/day, even
with your laptop closed. It survives restarts and deploys. You only ever need
to flip it once — check it's still ON when you open the dashboard.

Want a batch right now? Click **"Run next free batch"**. It runs in the
background; the button shows progress and the panels refresh when it's done.

## 4. Work CALL_READY rows first

In **Top Deals**, CALL_READY rows sort to the top. These have a real visible
phone number from a public page (trustee, servicer, or listing agent — the
contact route is labeled). For each one:

1. Click **Source proof** and skim the actual notice/document (30 seconds).
2. Open the **Seller questions** dropdown — those questions are generated from
   the actual evidence on the row.
3. Call the contact route. You are calling to learn: occupancy, condition,
   payoff, timeline, who actually decides.

## 5. Verify ZIP Review rows

The **ZIP Review** panel lists real addresses (street + city read by OCR from
an official foreclosure document) where the zip was unreadable. For each row:

1. Click **"Open official document (find the zip here)"** — read the zip
   directly off the county PDF.
2. Use the **"Maps search (zip unverified - review)"** link to confirm the
   street exists where you expect.
3. Once you've confirmed the full address, treat it like an INSPECT_NOW row.

**Never guess a zip. Never type a zip you didn't see in the document.** The
system refuses to fake one — that's why this panel exists.

## 6. Inspect the PDFs behind INSPECT_NOW rows

INSPECT_NOW rows have a full verified address from an official document.
Click **Source proof** and read the notice: sale date, borrower name (owner
clue), lender, trustee. OCR-extracted rows carry a "review recommended" flag —
double-check the street number against the PDF (OCR can drop a digit).

## 7. Skip blocked and junk rows without guilt

- Rows in the collapsed **"Source-proof rows without address yet"** list are
  evidence the machine is watching a document — they're not workable yet.
- Counties listed under **Source blockers** (Denton captcha, Collin Incapsula,
  Johnson 403, Tarrant portal) are blocked at the source, for free access.
  Don't fight them manually every day; check once a week if they opened up.
- A row with a past sale date or a generic address was already rejected —
  you'll never see it. If a row looks stale to you anyway, skip it.

## 8. When comps / ARV stay locked — this is why

Texas is a non-disclosure state: sold prices are not public record, and
Zillow/Redfin block automated access to sold data. So **ARV and MAO stay
LOCKED until verified comps exist** — the machine will not invent a number.
Your options, in order:
1. Run comps yourself in your MLS access / agent relationship (best).
2. Use the county **appraisal clue** on the row as a sanity check only —
   it is a tax value, explicitly NOT ARV.
3. If you decide to pay for data later (comps or skip trace), that unlocks
   automatically-filled ARV/MAO — until then, locked means honest.

The same logic applies to contacts: "Needs contact" means no free public
phone was visible. The owner clue (borrower name from the notice) is your
free starting point for manual lookup.

## 9. Daily routine (morning / noon / evening)

**Morning (5 min):**
- Open dashboard. Confirm AUTO-RUN chip says ON.
- Work every CALL_READY row (step 4). Verify any new ZIP Review rows (step 5).

**Noon (2 min):**
- Glance at "New rows today" and "Actionable today". New INSPECT_NOW rows?
  Read their PDFs (step 6). Nothing new? Close the tab — the machine keeps going.

**Evening (5 min):**
- Check "Runs today" (should be climbing toward 24) and the last auto-run
  error line (should be empty).
- Work anything actionable that appeared during the day.
- Counties post new foreclosure notices monthly (biggest wave right after the
  1st Tuesday cycle posting) — expect row jumps then, trickles otherwise.

That's it. The machine collects and filters all day; your job is the ~15
minutes of human judgment it can't do: reading zips off documents, calling
people, and walking properties.
