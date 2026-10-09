# Marketplace mobile evidence (#294)

`local-*` images and `local-measurements.json` use explicitly labeled fictional
LOCAL TEST DATA. They demonstrate layout only, not acquired deals, buyers or comps.
Ten actual dashboard screens are exercised at 360/393/400/412/1366/1920 widths,
with Android Chrome user-agent and read-only fixture routes. Writes and external
networks are denied. Controls are checked individually, not just page overflow.

`live-before-*` images are production header-only crops at 1366 and 412 widths.
Record bodies are deliberately excluded to avoid publishing personal information.
`live-after-*` header crops cover 1366/400/412 widths on all ten screens.
`live-measurements.json` records the actual control bounds, including the three
desktop Leads actions in its existing horizontal scroll wrapper. Phone bounds
and targets pass. Exact merged commit deployment succeeded, health returned 200,
12,039 records hydrated and a lead card opened/closed; console errors were zero.
No real record body is published in these screenshots.

No capture, contact, approval, import, evidence confirmation or batch is used.
