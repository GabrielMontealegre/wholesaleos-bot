# WholesaleOS Project State

- Gabriel wants a simple acquisition engine that finds real distressed-property opportunities he can call, not an engineering dashboard.
- Atlas owns strategy and final product direction. Codex handles implementation and source discovery. Mini handles focused verification.
- Dallas is the pilot market, not the final market. Source adapters should stay Dallas-only for now while using patterns that can expand county by county later.
- Current best money path is official foreclosure, trustee notice, tax sale, and tax resale evidence before support-only distress layers.
- Built so far: AI Deal Analyzer jobs, source evidence adapter, disabled-by-default comp/research provider routing, Dallas official source capture, browser/file capture, real file parser, code violations adapter, active/open code filtering, source priority router, and Dallas foreclosure notice adapter.
- Still missing: validated real Dallas foreclosure notice candidates from live source files/search pages, safe candidate promotion rules, phone/owner enrichment, and evidence-gated comp/offer workflow at calling volume.
- Next recommended source adapter after foreclosure notices: Dallas Public Works tax foreclosure resale/struck-off property adapter.
- Evidence gates stay mandatory: no fake leads, addresses, owners, debt, tax amount, auction amount, sale date, parcel, case, comps, ARV, MAO, DOM, or listing history.
- Candidate sources remain preview-only by default with `preview_only=true` and `should_ingest=false` unless Gabriel explicitly approves a promotion workflow.
- No fake comps, ARV, or MAO. AI Deal Analyzer valuation remains locked until verified sold-comps evidence gates pass.
