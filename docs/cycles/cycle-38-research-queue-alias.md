# Cycle 38 - Research Queue Read Alias

## Symptom and diagnosis

The dashboard script loaded, but the property queue stayed on `Loading public deals...`.
Production returned the stored Dallas snapshot normally, while the browser reported
`ERR_BLOCKED_BY_CLIENT` for the read request. The request path contained `deal-board`,
vocabulary commonly matched by privacy and advertising filter lists.

## Read paths

- Current neutral path: `GET /api/dashboard/research-queue/current`
- Backward-compatible path: `GET /api/dashboard/free-public-deal-board/latest`

Both paths are registered against the same named handler and the same
`deal_board:read` authorization middleware. They read the same snapshot cache and return
the same response, status and `Cache-Control: no-store` header. Neither route writes a
snapshot, creates a job, or saves a lead.

## Vocabulary rule

The neutral path excludes advertising, promotion, affiliate, tracking, sales and deal-board
terms that browser filter lists commonly block. The old path remains available for existing
local helpers and other backward-compatible clients.

The dashboard uses a 20-second read timeout. A blocked, failed or unauthorized request now
replaces the loading state with a plain-English explanation and a Retry button.
