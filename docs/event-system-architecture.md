# Event System Architecture

## Purpose
WholesaleOS needs a canonical event layer so lead, buyer, enrichment, outreach, assignment, and lifecycle actions can be tracked in a consistent way without rewriting the current app structure.

The goal is not to replace the existing database records or workflows. The goal is to add a lightweight, deterministic event spine that can support auditability, replay, automation, and future scale.

## Current Implementation Status
The event foundation is in place, but only a small part of the runtime is wired so far.

Implemented now:

- `appendEvent()` in `db.js`
- `getEvents()` in `db.js`
- capped event storage at `5000`
- `dedupe_key` support
- payload safety stripping for bulky or unsafe fields
- `status_changed` emitted from `PUT /api/leads/:id/status`
- `assignment_created` emitted from `POST /api/assignments`
- no UI/render event emission
- no ingestion, evidence, or enrichment event emission yet

Deferred emitters:

- `lead_created`
- `lead_deduped`
- `enrichment_queued`
- `enrichment_completed`
- `enrichment_failed`
- `outreach_sent`
- `outreach_failed`
- `followup_created`
- `buyer_matched`
- `buyer_sent`
- `evidence_added`
- `lead_archived`

Operating rules for the current checkpoint:

- Do not emit from dashboard render functions.
- Do not use events as the only source of truth.
- Do not log full lead, buyer, assignment, or contract payloads.

## Why Event-Driven Architecture Matters
Wholesale operations grow messy when each subsystem stores its own version of truth in isolation. Status, enrichment, outreach, follow-ups, assignments, and buyer matching already exist as separate flows in WholesaleOS.

A canonical event system helps by:

- preserving an immutable operational trail
- making it easier to understand how a lead moved through the pipeline
- reducing coupling between subsystems
- enabling later automation without redesigning core flows
- supporting replay and debugging without scanning every domain table
- keeping future AI and workflow features additive instead of invasive

This matters especially as lead volume increases and more source types, enrichment steps, and disposition workflows are added.

## Canonical Event Envelope
Every event should use the same envelope shape.

```json
{
  "event_id": "EVT-123",
  "event_version": "v1",
  "event_type": "lead_created",
  "category": "lifecycle",
  "occurred_at": "2026-05-13T12:34:56.000Z",
  "entity": {
    "type": "lead",
    "id": "L123",
    "ref_number": "WOS-12345"
  },
  "actor": {
    "type": "system",
    "id": "server",
    "user_id": "admin"
  },
  "source": {
    "system": "server",
    "module": "db",
    "route": "/api/leads",
    "source_kind": "courthouse",
    "source_id": "shelby-foreclosure-pdf"
  },
  "payload": {},
  "correlation_id": "CORR-123",
  "causation_id": "EVT-122",
  "dedupe_key": "lead_created|L123|hash",
  "severity": "info",
  "confidence": "medium"
}
```

### Envelope fields
- `event_id`: unique event identifier.
- `event_version`: schema version for backward compatibility.
- `event_type`: specific event name.
- `category`: broad grouping for filtering and consumers.
- `occurred_at`: UTC timestamp.
- `entity`: the primary object affected.
- `actor`: who or what caused the event.
- `source`: system and module that emitted it.
- `payload`: small deterministic delta only.
- `correlation_id`: groups related events from one workflow.
- `causation_id`: points to the immediate upstream event.
- `dedupe_key`: prevents duplicate spam.
- `severity`: optional operational severity.
- `confidence`: optional confidence of the event or signal.

## Event Categories
Recommended canonical categories:

- `lifecycle`
- `evidence`
- `enrichment`
- `outreach`
- `assignment`
- `buyer`
- `followup`
- `ingestion`
- `archive`
- `system`
- `audit`

## Event Examples
Recommended event types:

- `lead_created`
- `evidence_added`
- `lead_deduped`
- `enrichment_queued`
- `enrichment_completed`
- `outreach_sent`
- `outreach_failed`
- `status_changed`
- `followup_created`
- `assignment_created`
- `buyer_matched`
- `buyer_sent`
- `lead_archived`
- `lead_closed`

Example payloads should stay small and deterministic:

```json
{
  "event_type": "status_changed",
  "category": "lifecycle",
  "payload": {
    "from": "Contacted",
    "to": "Under Contract"
  }
}
```

```json
{
  "event_type": "enrichment_completed",
  "category": "enrichment",
  "payload": {
    "fields_updated": ["owner_name", "owner_type"],
    "source_name": "philly_opa"
  }
}
```

```json
{
  "event_type": "buyer_sent",
  "category": "buyer",
  "payload": {
    "buyer_id": "B123",
    "lead_id": "L123"
  }
}
```

## Recommended First Emitters
The safest first emitters are the paths that already change durable state:

- lead creation and duplicate merge in `db.js`
- lead status changes in `server.js`
- enrichment queue transitions in `enrichment-queue.js`
- outreach record writes in `modules/outreach.js`
- follow-up sequence creation in `modules/followup.js`
- assignment creation in `server.js`
- buyer send/match actions in `server.js` and `modules/buybox.js`

## Recommended Future Emitters
Later emitters can expand into:

- evidence normalization and fusion
- skip trace completion
- contract generation
- disposition completion
- lead archive and restore flows
- buyer creation and buyer edits
- review queue decisions
- paid enrichment provider calls
- future automation rule triggers

## Systems That Should Not Emit Events
These should not emit events yet:

- dashboard render functions
- UI tab navigation
- search and filter handlers
- GET list endpoints
- polling loops
- queue heartbeat updates
- derived read-only computations
- transient DOM patches

Events should be emitted on durable state changes, not on reads or presentation logic.

## Persistence Strategy
The lowest-cost starting point is to store events in the existing JSON database as an append-only `events` array.

Recommended shape:

```json
{
  "events": [
    {
      "event_id": "EVT-123",
      "event_type": "lead_created",
      "entity": { "type": "lead", "id": "L123" },
      "occurred_at": "2026-05-13T12:34:56.000Z",
      "payload": {}
    }
  ]
}
```

Recommended initial rules:

- append only
- keep events compact
- cap the array to a hot window if needed
- preserve domain records separately
- do not migrate existing data
- do not depend on the event log as the only source of truth

TTL-based storage can come later if volume grows. Permanent storage is not required on day one.

## Replay And Debug Strategy
The event layer should support future replay and debugging by:

- filtering by `entity.id`
- filtering by `event_type`
- filtering by `correlation_id`
- filtering by time range
- reading the last N events for one lead or buyer

This makes it possible to reconstruct a lead’s operational path without scanning every subsystem independently.

## Dedupe And Anti-Spam Strategy
To keep event volume under control:

- only emit on durable writes
- suppress duplicates with a deterministic `dedupe_key`
- merge repeated queue or retry noise into one logical event
- never emit from render paths
- never emit on no-op status changes
- keep payload deltas small

The dedupe key should usually combine:

- event type
- entity id
- meaningful state delta
- a stable hash or normalized signature

## Correlation And Causation IDs
Use both IDs consistently.

- `correlation_id` groups all events from one workflow, like a lead intake flow or one buyer-send operation.
- `causation_id` points to the exact upstream event that triggered the current one.

Examples:

- `lead_created` can start a new correlation chain.
- `evidence_added` can cite the intake or source event that caused it.
- `status_changed` can point back to the user action or automation event that caused the transition.
- `assignment_created` can point back to the status change or buyer-send event that led to it.

## Integration Points

### Lead Lifecycle
Events should follow the lead lifecycle from intake through closure or archive.

### Evidence Fusion
Evidence fusion should emit `evidence_added` only when a new normalized evidence entry is actually added.

### Lead Intelligence
Lead intelligence should remain a read-side computed object. It can be attached to events as a snapshot reference later, but it should not be the event source of truth.

### Enrichment Queue
The queue should emit `enrichment_queued`, `enrichment_completed`, and `enrichment_failed` around durable state transitions.

### Outreach
Outreach should emit when a record is saved or a send attempt succeeds or fails.

### Assignments
Assignment creation should emit `assignment_created` and, later, `assignment_closed` or `assignment_updated` if needed.

### Buyer Matching
Buyer matching should emit `buyer_matched` only when a real match is produced, and `buyer_sent` when the deal is actually sent.

## Low-Cost Infrastructure Strategy
The event system should stay cheap by:

- reusing `db.js` and the current atomic JSON write pattern
- keeping events small and append-only
- avoiding a new queue or broker
- avoiding real-time fanout at first
- storing only operationally useful metadata
- deferring any external infrastructure until event volume proves it is needed

This keeps the foundation lightweight while preserving a clean path to a more robust event store later.

## Migration Strategy
The migration should be additive and incremental:

1. add an event helper in `db.js`
2. add read helpers for filtering events later
3. emit from a small set of durable write paths first
4. keep all current domain records in place
5. expand emitters only after the initial event shape is stable

Do not rewrite ingestion, the dashboard, or historical records.

## Operational Risks
Main risks to watch:

- duplicate truth across events and domain records
- event spam from noisy emit points
- oversized payloads
- treating events as a replacement for domain storage too early
- mixing read-side intelligence with write-side events
- accidental coupling to UI or polling behavior

## What Should Explicitly Not Be Implemented Yet
- no event broker
- no Kafka, Redis Streams, or external queue
- no dashboard event explorer
- no AI inference from raw event logs
- no event-sourced rewrite of the app
- no DB migration
- no rewrite of enrichment queue behavior
- no rewrite of outreach or buyer matching logic
- no automatic automation actions on every event

## Future Vision
This event system creates the backbone for future automation without forcing a redesign later.

Over time it can power:

- automation rules that react to real operational events
- auditable lead, buyer, and assignment trails
- AI reasoning over compact workflow history
- acquisition queues that prioritize the right leads
- scalable enrichment decisions based on actual signal history
- multi-user workflows with clear causality and ownership

The key is that the foundation stays simple now, so the platform can grow later without architectural whiplash.
