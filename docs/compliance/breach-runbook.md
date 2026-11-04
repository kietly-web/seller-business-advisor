# Personal data breach runbook (72 hours)

Prepared 05/11/2026 · Backlog SA-110 · Owner: founder (incident lead) · Notification format and channel: **counsel to confirm** (Decree 356/2025/ND-CP)

When anyone suspects personal data was exposed, lost or altered, start the clock and follow these steps. Hour 0 is when we become aware, not when the breach happened. Personal data here means seller account data (C2). Buyer data (C3) should never be present; finding any is itself an incident.

## Roles

| Role | Who (fill in) | Does |
| --- | --- | --- |
| Incident lead | Founder | Decides severity, owns the timeline and notifications |
| Technical responder | Developer on duty (or founder) | Contains, collects evidence, fixes |
| Counsel | Data-protection lawyer | Confirms whether and how to notify |

## Timeline

| Window | Step | Actions |
| --- | --- | --- |
| 0–4 h | Triage | Open an incident note (time, reporter, what was seen). Classify data affected (C2 seller account, C1 business, any C3). List shops affected from `app.audit_log` and logs. |
| 0–12 h | Contain | Rotate exposed secrets (Vercel env, Neon role passwords, `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`). Revoke sessions. Block the path (feature flag, Vercel Firewall rule, revoke a grant). Take a Neon branch snapshot for forensics. |
| 12–36 h | Assess | Scope from `app.audit_log`, Vercel logs, Neon query history and `app.llm_call`. Decide: was personal data accessed or disclosed? How many sellers? Ongoing risk? |
| by 72 h | Notify | If personal data is affected: notify the Ministry of Public Security through its channel (**counsel** for form), and affected sellers in Vietnamese (template below). Record the decision either way. |
| week 1–2 | Review | Blameless postmortem; a test that would have caught it; update the threat model (03), this runbook and the data inventory. |

## Evidence sources

- `app.audit_log` (who did what, append-only; 24 months)
- Vercel request logs (request id, route, shop id; no bodies)
- Neon: query statistics, branch snapshots, point-in-time restore
- GitHub: commits, Actions runs, Dependabot alerts
- Error tracking (once added, Q-I3)

## Seller notification template (Vietnamese)

> **Thông báo sự cố bảo mật dữ liệu**
>
> Ngày [dd/MM/yyyy], chúng tôi phát hiện [mô tả ngắn sự cố]. Dữ liệu có thể bị ảnh hưởng: [loại dữ liệu]. Dữ liệu người mua không có trong hệ thống của chúng tôi.
>
> Chúng tôi đã [biện pháp đã thực hiện]. Bạn nên [việc người bán cần làm, ví dụ đổi mật khẩu].
>
> Nếu bạn có câu hỏi, liên hệ [kênh hỗ trợ]. Chúng tôi xin lỗi vì sự cố này.

## Drills

Run a 30-minute tabletop drill before beta and every 6 months: pick a scenario (leaked `DATABASE_URL`, a parser bug that let a phone number through, a compromised seller account), walk the timeline, and fix gaps in this runbook.
