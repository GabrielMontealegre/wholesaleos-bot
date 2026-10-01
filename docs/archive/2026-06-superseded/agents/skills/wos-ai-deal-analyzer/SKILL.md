---
name: wos-ai-deal-analyzer
description: Build analyzer flows that stay evidence-first and avoid fake research.
---

# wos-ai-deal-analyzer

Use this when working on AI Deal Analyzer, selected-lead preflight, analyzer jobs, source evidence, or comp research adapters.

- Flow should be: selected or pasted leads -> backend jobs -> source evidence -> comp provider -> evidence-gated result.
- Do not make manual comp intake the main workflow.
- Do not add live provider calls unless the provider is configured and explicitly enabled.
- Do not fake research results.
- Preserve blocked states for bad, partial, or source-poor leads.
- Analyzer output should explain what exists, what is missing, and the next safe action.

