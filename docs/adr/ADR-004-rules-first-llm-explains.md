# ADR-004 Rules decide; the LLM explains through placeholders only

Status: Accepted · 2026-11-04

## Context

Discovery says every number a seller sees must be calculated, not generated (NFR-AIQ: zero stray numbers). Sellers distrust opaque algorithms (risk R5). The AI Law expects transparency and human oversight.

## Decision

- A deterministic rule library in `packages/engine` produces candidates, impact ranges and confidence.
- The LLM receives pre-formatted fact strings and must reference them only as `{{placeholder}}` tokens. Output with any digit outside a placeholder, or an unknown placeholder, is rejected, and a static template is used instead.
- Step-by-step checklists are static, versioned content, not generated.

## Consequences

- NFR-AIQ is enforced by construction, not just measured.
- The LLM's wording is somewhat constrained, which is acceptable for short action cards.
- Every rule needs a handwritten Vietnamese template, which doubles as the fallback and the test oracle.

## Alternatives considered

- LLM writes free text, then numbers are checked against the payload: number formats in Vietnamese (`0,9 triệu`, `1.234.000 ₫`) make matching brittle, and partial matches slip through.
- LLM decides the actions: not explainable, not reproducible, and fails R5.
