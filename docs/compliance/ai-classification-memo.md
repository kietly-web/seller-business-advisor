# AI system classification memo (AI Law 134/2025/QH15)

Prepared 05/11/2026 · Backlog SA-110 · Provider: the operating household business · Status: self-assessment, **counsel to confirm** (Q-L3)

We self-classify the Seller Advisor MVP as a **low-risk** AI system. It gives decision support to business owners about their own shop, a human approves and performs every action, and every AI output is labelled. We will re-assess before the ask-your-data chat (FR-13) ships, because a conversational interface may count as a system users might not recognise as AI, which the law places in the medium tier.

## System description

| Item | Description |
| --- | --- |
| Purpose | Help small Shopee sellers decide what to reprice, restock, promote or drop, using their own data |
| Users | Sellers (business owners and their staff), not consumers |
| Inputs | The seller's exported orders, fees, traffic and stock; seller-entered costs and competitor prices |
| What decides | A deterministic rule engine (`packages/engine`): metrics, rule thresholds, impact ranges and confidence are computed in code |
| What the AI does | Claude (Anthropic) rewrites each computed recommendation as 2–3 Vietnamese sentences. It receives pre-formatted facts and may only reference them as `{{placeholders}}`; any digit it writes itself is rejected and a static template is used instead (ADR-004) |
| Outputs | At most 5 action cards a week, each with evidence, impact range, confidence and a step-by-step checklist (static content, not generated) |
| Automation | None. Nothing changes in Shopee; the seller performs every action |
| Personal data in AI inputs | None: payloads contain SKU-level aggregates and product names only |

## Risk-tier reasoning

| Factor | Assessment |
| --- | --- |
| Affects fundamental rights, safety, credit, employment, access to essential services? | No. Business decision support for the seller's own shop |
| Makes or executes decisions? | No. Recommends; the human decides and acts |
| Could users mistake it for a human or not realise AI is involved? | No for the MVP: fixed action cards, each labelled "Gợi ý do AI tạo, dựa trên dữ liệu bạn đã tải lên". Possibly yes once chat ships (re-assess) |
| Scale and reversibility of harm | A bad suggestion can cost margin on one SKU; the seller can ignore or reverse it. Outcomes are measured and shown, including failures |
| Conclusion | Low risk (post-incident review regime) — **counsel to confirm** |

## Controls we keep in place

1. Every AI output labelled as AI-generated; demo data labelled "Dữ liệu mẫu".
2. Numbers are computed, never generated (placeholder validation; zero stray numbers on every golden-set run, NFR-AIQ).
3. Human approval for every action; dismissals with reasons feed rule review.
4. Insufficient-data state instead of guesses (< 4 weeks of history).
5. Versioned prompts and rule versions recorded on every run; golden-set results kept as the technical file.
6. Track record of past recommendations, including ones that did not work, shown to each seller.

## Technical documentation kept

`docs/design/05-recommendation-engine.md`, `docs/design/06-llm-integration.md`, ADR-004, ADR-005, prompt files `packages/llm/prompts/*.v<n>.md` (from SA-405), golden-set results in CI.

## Re-assessment triggers

Re-run this memo before any of: ask-your-data chat (FR-13); any automated action in Shopee; using AI to rank or score sellers for anyone other than themselves; adding consumer-facing features; a new LLM provider or model family.
