# Trustee sale list preflight (#301 slice 1 / D-053)

Checked 2026-10-10: Brock & Scott's public foreclosure list renders a table with
county, labeled sale date/time, state, court SP number, trustee case/file number,
property address, opening bid and book/page. The web-rendered total is 898,
not a captured Charlotte row count or a count of qualified deals.

Sources:
- https://www.brockandscott.com/foreclosure-sales/
- https://www.brockandscott.com/terms-of-use/

Outcome: BLOCKED pending commercial-use permission, needs-architect #315.
The Restrictions on Use of Materials section limits copying/redistribution to
personal noncommercial use absent written approval. This does not expressly
mention robots; do not rewrite this finding as a blanket automated-access ban.
No affirmative commercial permission has been established. No raw list corpus,
property rows or downstream owner/comp evidence were ingested or published.
No direct first-party HTTP status is claimed from the web reader's result.

The source is not registered/enabled. Generic pipeline code and permitted
alternative publishers remain possible, but the first publisher must not be
activated while the permission question is unresolved. Opening bids are not
payoffs, asking prices or offer inputs. County geometry/PIN alone cannot prove
owner identity, building facts or sale-price comps. Missing facts stay missing.
