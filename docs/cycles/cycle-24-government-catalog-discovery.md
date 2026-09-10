# Cycle 24 - Government Catalog Discovery

## Purpose

Find possible official public-data sources faster without weakening WholesaleOS
source verification or creating unproved lead evidence.

## What Shipped

- Bounded searches of ArcGIS, Socrata, and the current Data.gov Catalog API.
- Optional searches of explicitly supplied government `data.json` catalogs.
- County, state, and property-signal relevance checks.
- Machine-readable URL checks before a result can become a candidate.
- A command-line report that is read-only unless `--write` is requested.

Every discovery result is still unverified. It cannot create a lead, alter a
snapshot, enable a source lane, unlock ARV, or write to saved leads.

## Live Dallas Check

On 2026-09-10, a bounded five-result-per-catalog check returned:

| Catalog | HTTP | Results inspected | New candidates |
|---|---:|---:|---:|
| ArcGIS | 200 | 0 | 0 |
| Socrata | 200 | 5 | 0 |
| Data.gov | 200 | 0 | 0 |

The honest result was zero new Dallas sources. No source was promoted. Data.gov's
former CKAN endpoint returned 404 and was replaced with the official GSA v4
Catalog API before release.

## Next Business Bottleneck

Catalog discovery reduces research time, but it does not create seller phone or
email routes. The current priority remains converting source-proven properties
into honestly labeled contact-ready rows.
