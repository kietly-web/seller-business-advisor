# 05 — Recommendation engine

Recommendations come from a deterministic pipeline: **see** (compute weekly SKU metrics), **diagnose** (rules raise signals), **prioritise** (expected impact × confidence × ease), **explain** (the LLM phrases it, see [06](06-llm-integration.md)), **act** (the seller follows a checklist in Seller Centre), and **learn** (outcomes adjust rule confidence). `packages/engine` is pure TypeScript with no I/O: the same inputs always give the same outputs, which is what makes the golden set possible.

## Engine interface

```ts
export function computeWeekMetrics(input: ShopFacts, week: IsoWeek): SkuWeekMetric[];
export function evaluateRules(ctx: RuleContext): Candidate[];           // all signals, unranked
export function rank(cands: Candidate[], opts: RankOpts): Candidate[];  // top ≤ 5, diversified
export function measureOutcome(rec: AcceptedRec, before: Series, after: Series, shopTrend: Series): OutcomeResult;
export const ENGINE_VERSION = '1.0.0';
```

`ShopFacts` is loaded by a repository in `packages/db`. The engine never imports the database.

## See: metric definitions (FR-06)

All values are per SKU per ISO week (Monday–Sunday, `Asia/Ho_Chi_Minh`), counting **completed** order lines by `completed_at`. Cancelled and returned lines are excluded from revenue and kept for the return-rate metric.

| Metric | Formula |
| --- | --- |
| `gross_revenue` | Σ quantity × deal price |
| `seller_discount` | Σ seller-funded vouchers and discounts allocated to the line |
| `net_revenue` | gross_revenue − seller_discount |
| `platform_fees` | Σ line-level fees + order-level fees allocated pro rata by the line's share of order gross revenue |
| `cogs` | Σ quantity × (cogs + packaging) using the `unit_cost` effective on the order date; **null** if any line lacks a cost |
| `contribution_margin` | net_revenue − platform_fees − cogs |
| `margin_pct` | contribution_margin ÷ net_revenue |
| `avg_selling_price` | net_revenue ÷ units |
| `conversion_pct` | orders ÷ visitors (if traffic data exists) |
| `avg_daily_units_28d` | units over the trailing 28 days ÷ 28 |
| `stock_cover_days` | on_hand (latest snapshot) ÷ avg_daily_units_28d; null if no stock data; ∞ if no sales |
| `competitor_median` | median of the latest observation per listing within 14 days, ≥ 2 listings required |
| `price_gap_pct` | (avg_selling_price − competitor_median) ÷ competitor_median |

Sanity rules: all money arithmetic is in `bigint`, and percentages are computed once at the end in `number` and rounded to 4 decimals. Allocation residue from rounding goes to the largest line, so the totals reconcile exactly with the income export. A test asserts Σ allocated = Σ order fees.

## Diagnose: rule library v1

Each rule is a module: `{ code, version, actionType, applies(ctx), evaluate(ctx) → Candidate | null, impact(ctx) → [low, high], baseConfidence, ease, cooldownWeeks, checklistKey, facts(ctx) }`.

| Code | Signal (defaults; seller settings override) | Action | Impact estimate (per 30 days) | Base conf. | Ease |
| --- | --- | --- | --- | --- | --- |
| `MARGIN_BELOW_TARGET_UNDERPRICED` | margin_pct < target (15%) **and** price_gap_pct < −5% **and** units stable (CV of 4 weekly units < 0.35) | Raise price toward the competitor median, capped at +8% | CM gain if units fall 0–(elasticity × Δprice); see below | 0.60 | 0.9 |
| `NEGATIVE_MARGIN` | contribution_margin < 0 for 2 consecutive weeks | Stop seller discount / raise price / delist | Recover the lost CM: [50%, 100%] of the current weekly loss × 4.3 | 0.70 | 0.8 |
| `STOCKOUT_RISK` | stock_cover_days < lead_time + 7 **and** avg_daily_units_28d ≥ 0.5 | Restock now; suggested qty = 30 days of demand − on_hand | CM per unit × units at risk in the gap days, [60%, 100%] | 0.65 | 0.7 |
| `DEAD_STOCK` | on_hand > 0 **and** 0 units in 28 days **and** SKU older than 45 days | Clearance discount / bundle / delist | Cash freed: on_hand × cogs × [20%, 50%] (shown as cash, not CM) | 0.50 | 0.6 |
| `PRICE_ABOVE_MARKET_LOW_CONVERSION` | price_gap_pct > +10% **and** conversion < shop median × 0.7 | Review price toward the median | Δunits from conversion recovery × CM per unit, [0, 70%] | 0.45 | 0.9 |
| `HIGH_VIEWS_LOW_CONVERSION` | views in shop top quartile **and** conversion < shop median × 0.5 **and** price gap within ±5% | Improve listing (images, title, variations) | Units if conversion reached the shop median × CM per unit, [10%, 40%] | 0.35 | 0.5 |
| `CAMPAIGN_UNPROFITABLE` | during the last campaign week, margin_pct < 0 **and** uplift in units < 2× | Don't rejoin at that discount; suggest the break-even discount | Avoided loss next campaign, [50%, 100%] | 0.55 | 0.9 |
| `COST_MISSING` (meta) | SKU in the top 20 by revenue without a cost | Enter cost (banner, not ranked) | n/a | n/a | n/a |

Price-change impact uses a deliberately simple, visible elasticity assumption: a 1% price rise reduces units by 0%–1.5% (low/high bounds). The range is the CM change across those two bounds over 30 days. The card's confidence label tells the seller this is an estimate. The elasticity bounds are per-category config, to tune from outcome data.

### Data sufficiency (US-05)

- A shop needs ≥ 4 complete ISO weeks of orders. Otherwise the run status is `insufficient_data` and the UI shows what is missing.
- A rule needs its inputs. With no traffic export, conversion rules are skipped. With no stock data, stock rules are skipped, and the UI says which upload would unlock them (an activation nudge).
- A SKU needs ≥ 10 completed units in 28 days for price rules, so we don't recommend price changes from noise.

## Prioritise

```
score = midpoint(impact_low, impact_high) × confidence × ease
confidence = baseConfidence × dataQuality × learned
dataQuality ∈ [0.5, 1] = f(weeks of history, cost coverage, sample size)
learned = posterior mean of Beta(α, β) for the rule (shop-level, shrunk toward global) ÷ global prior mean, clamped [0.5, 1.5]
```

Selection:

1. Drop candidates in cooldown: the same rule + SKU was shown in the last `cooldownWeeks` (default 2), or dismissed with reason `not_relevant` in the last 8 weeks.
2. At most one action per SKU (keep the highest score).
3. At most 2 actions of the same `action_type`, so the list stays varied.
4. Keep the top 5. Confidence labels: `high` ≥ 0.65, `medium` ≥ 0.45, else `low`.
5. Persist every candidate's score in the run's debug record (worker-only table or log) for rule tuning, not only the top 5.

## Act

Each `checklistKey` maps to a Vietnamese step-by-step checklist with the Seller Centre path, for example for a price change: Sản phẩm → Tất cả sản phẩm → Sửa → Giá. Checklists are static content, versioned with the rule, and not LLM-generated, because instructions must be exact. The LLM may only add one sentence of context.

## Outcome measurement

For a recommendation marked done at `t0`:

| Element | Definition |
| --- | --- |
| Baseline | Daily average units and CM of the SKU over the 28 days before `t0` (excluding campaign days) |
| Observed | Daily average over `t0+1 … t0+7` and `t0+1 … t0+14` |
| Shop trend adjustment | Same windows for all other SKUs of the shop. Observed Δ minus the shop's relative Δ (difference-in-differences) removes shop-wide effects such as a campaign or Tết |
| Result | `positive` if adjusted ΔCM/day > +5% of baseline CM/day; `negative` if < −5%; else `neutral`; `insufficient_data` if < 5 orders in either window or the SKU had a stockout in the window |
| Learning | Positive → α += 1; negative → β += 1; neutral → α += 0.5, β += 0.5; insufficient → no update. Shop and global records both update |

This feeds the north-star metric and the per-rule track record shown to the seller (including failures, per discovery).

The method is honest about its limits: it is an estimate, not a controlled experiment. The UI says "ước tính", and the track record shows counts, not just rates.

## What-if simulator (FR-14, Should)

The simulator uses the same `impact()` functions run interactively: the seller picks a SKU and a discount %, and gets the CM range at the low and high elasticity bounds plus the break-even discount. Pure engine code, no LLM.

## Golden set

`packages/engine/golden/` holds scenario files (YAML): a synthetic fact snapshot plus the expected candidates, ranks and fact values. It starts with 20 scenarios: each rule firing, each rule correctly *not* firing near its threshold, the insufficient-data paths, cooldown and diversity limits, the allocation reconciliation, and the outcome classification cases. It runs in CI on every change to `engine`, `llm` or prompts. The same scenarios drive the LLM checks in [06](06-llm-integration.md#evaluation).
