# Counsel questions pack

For: a Vietnamese data-protection lawyer · Prepared 04/11/2026 · Backlog SA-005 · Owner: founder (sends and records answers)

We are asking for a written opinion before a closed beta with real sellers. Each item gives the product facts, the reading we are currently working from, and what we would build under each answer. Our readings come from law-firm briefings summarised in the discovery pack, not from the legal texts. Please correct any of them.

## Product facts (apply to every question)

- **What it is.** A web app for small Shopee Vietnam sellers. The seller uploads their own Seller Centre exports (XLSX/CSV) and unit costs. The app computes weekly profit per product and suggests at most 5 actions a week, each explained in Vietnamese by an LLM. The seller decides and performs every action in Shopee themselves; the app changes nothing in Shopee.
- **Who uses it.** Sellers (individuals and household businesses), not consumers. No public user content, no messaging between users.
- **What we store.** Seller business data (products, prices, fees, costs, competitor prices the seller types in); seller account data (email, name, consent records, session IP and user agent); an append-only audit log.
- **What we never receive.** Buyer name, phone, email and address columns are deleted in the seller's browser before upload. Shopee order IDs are hashed in the browser. Uploaded files are not stored.
- **Where data goes.** All servers are outside Vietnam:

| Sub-processor | Purpose | Data | Location |
| --- | --- | --- | --- |
| Vercel | Hosting, functions, logs | Seller business + account data (transit, logs) | Singapore (`sin1`) |
| Neon | Postgres database | Seller business + account data | Singapore (AWS `ap-southeast-1`) |
| Anthropic (Claude) | Writes explanations; later, chat | Per-product aggregates and product names only | Outside Vietnam; exact location being confirmed (Q-T2) |
| Google | Sign-in | Seller email, name | Global |
| Email provider, error tracking | Verification emails; exception reports (scrubbed) | Seller email; scrubbed errors | Not chosen; Singapore preferred |

- **Who operates it.** Planned operator: the founder's registered household business (hộ kinh doanh), with a business line added for software services. No company incorporated yet. No real seller data processed yet.

## Q-L1 Data localisation (Cybersecurity Law 116/2025/QH15 and its decrees of 19 Aug 2026)

**Questions.** (a) Is a seller-analytics SaaS as described above an enumerated service whose user data must be stored in Vietnam? (b) If yes, which of our data is in scope (seller account data, seller business data, audit log), and does it apply to a household business as it does to an incorporated company? (c) Is a copy in Vietnam enough, or must the primary store and processing be in Vietnam? (d) From what date, and is there a transition period?

**Our assumption.** Not enumerated, so Singapore hosting can stay, but we treat this as unresolved (risk R1).

**Design impact.** Not in scope: no change. Storage only: move Postgres to a Vietnamese cloud before beta (ADR-002 exit path); app servers stay in Singapore. Storage and processing: move compute too, which means leaving Vercel's Singapore region and re-planning hosting.

## Q-L2 Role under the E-commerce Law 122/2025/QH15 and Decree 356/2025/ND-CP

**Questions.** (a) Are we an e-commerce support service provider under the E-commerce Law (Arts. 33–36)? If so, which duties apply (data supply to authorities, traceability, published policies, complaint channel) and is any registration or notification needed? (b) Are we a data-processing service provider under Decree 356 when we process sellers' business data for them? (c) For seller account data, are we the controller? For data inside the sellers' exports, is the seller the controller and we the processor?

**Our assumption.** Possibly a support service provider; we already plan an audit log, Vietnamese terms, privacy policy and complaint channel. We are unsure whether we are a data-processing service provider.

**Design impact.** Support provider: add an authority-request procedure and confirm audit-log contents and retention (Q-L5). Data-processing service provider: we lose the small-business DPO grace (see Q-L6), and seller terms need a processor agreement section.

## Q-L3 AI Law 134/2025/QH15 risk tier

**Questions.** (a) Is the MVP low risk? It writes explanations only, every output is labelled "Gợi ý do AI tạo", rules compute every number, and the seller approves and performs every action. (b) Does adding a Vietnamese chat that answers questions about the seller's own data (FR-13) move it to medium risk? (c) For whichever tier applies, what must the classification dossier contain, and what notice to the Ministry of Science and Technology is required and when?

**Our assumption.** Low for the MVP; possibly medium once chat ships. We will write a self-classification memo (SA-110) and re-assess before chat.

**Design impact.** Low: label and keep technical documentation (already designed). Medium for chat: dossier and ministry notice before FR-13 ships; chat stays behind a flag until then. Medium for the MVP: the dossier and notice move before beta.

## Q-L4 Cross-border transfer impact assessment (PDP Law 91/2025/QH15, Decree 356)

**Questions.** (a) Does storing and processing seller personal data with the sub-processors above require a transfer impact assessment? (b) When does the 60-day clock start: first sign-up in a closed beta, or public launch? (c) What content and format does the Ministry of Public Security portal expect, and must each sub-processor be named? (d) Does adding or changing a sub-processor require an update filing? (e) Does a household-business exemption (Q-L6) cover this assessment?

**Our assumption.** Required regardless of Q-L1, filed within 60 days of the first real seller sign-up, listing every sub-processor with its country (draft in SA-508).

**Design impact.** Fixes the date the draft must be ready and whether each new sub-processor needs a filing, not only an ADR and a notice to sellers.

## Q-L5 Retention periods

| Data | Proposed | Question |
| --- | --- | --- |
| Consent records (who, purpose, policy version, hash of wording shown) | Account life + 5 years | Is there a required or maximum period for proof of consent? Can we keep them after an account deletion request, and on what basis? |
| Audit log (consent changes, uploads, cost edits, decisions, data requests, admin access; seller user ID and IP) | At least 24 months | Does a minimum apply (Cybersecurity Law, E-commerce Law traceability) even if Q-L1 is "not enumerated"? Must it survive account deletion, and may we pseudonymise the seller in it instead? |

**Design impact.** Sets the retention job's periods and what account deletion does to these two tables.

## Q-L6 Operating through the household business

**Questions.** (a) Can a household business lawfully provide a subscription SaaS to sellers nationwide, and what business line must it register? (b) Do the household-business exemptions (no DPO, no impact assessments) apply to us, and would being a data-processing service provider (Q-L2) remove them? (c) Can a household business sign cross-border agreements with Vercel, Neon and Anthropic and file the transfer assessment? (d) Shopee Vietnam does not accept individual developers for its Open Platform: is a household business eligible as an ISV, or is a company needed (Q-D2)? (e) At what point (seller count, revenue, staff) should we incorporate instead?

**Our assumption.** Operate as the household business through beta, then reassess.

**Design impact.** If not viable: incorporate before beta, which changes the operator named in the terms and privacy policy, the contracting party with sub-processors, and the Shopee ISV application.

## What we need back

A short written answer per item (yes / no / depends, with the article relied on), anything we have missed, and an estimate of fees and turnaround. Answers are recorded in `docs/discovery/discovery-summary.md`; any that change the design get an ADR.
