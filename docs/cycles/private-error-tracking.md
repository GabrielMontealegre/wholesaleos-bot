# Optional private error tracking

OFF unless SENTRY_DSN is a valid HTTPS Sentry DSN. No SDK import/server error
transport or browser CDN/telemetry request when disabled. The dashboard reads
only admin-gated no-store configuration after login. SDK10.22.0 supports Node18+
and therefore the existing Node20 minimum; no runtime-engine change.

Names cannot safely be identified by a regex. Both sides instead rebuild events
from an explicit allowlist: error type, known code filename and numeric line/
column. Raw error text, function names, locals, user/contact/address fields,
requests/URLs/headers/cookies/bodies, tags, contexts, extras, breadcrumbs and
attachments are discarded. This deliberately loses message detail for privacy.
No session replay, tracing, logs, DOM or automatic default integrations.

Server covers uncaught exceptions/rejections, Express errors and generic HTTP5xx
signals. Existing fatal exit remains1; enabled flush is bounded to1500ms.
Browser covers explicit global errors/rejections after authenticated setup;
SDK load failure cannot block rendering. No source, contact or readiness changes.

No DSN/account/paid plan or Railway variable has been created or enabled.
Tests use synthetic sentinels and fake SDK only; do not send a real property,
contact, session secret or forced production error as a verification event.
Cloud full-suite and live read-only OFF-state verification remain required.
