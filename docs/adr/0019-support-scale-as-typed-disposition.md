# 1-5 support scale as typed disposition enum

Replace freeform disposition strings with the industry-standard 1-5 support scale: 1=Strong Support, 2=Lean Support, 3=Undecided/Persuadable, 4=Lean Opposition, 5=Strong Opposition. Optional sub-dispositions for granularity. This is the standard in every VAN/NGP implementation, validated by decades of field experiments. It enables persuasion/GOTV targeting by support level — the three-phase model (ADR-0020) depends on it. A real user (Ayaan Virani) directly requested an "Undecided" button — that's `3` on this scale. Replaces the freeform `outreach_attempt.disposition: string` and the hardcoded disposition badges in `QueueTable.tsx`.

## References

- `door-knocking-field-operations-best-practices.md` §2 (The Support Scale 1-5: "the 1-5 scale is the industry standard in most VAN implementations")
- `crm-strategy-for-political-organizations.md` §2 (Voter Scoring Models: support/persuadability/turnout scores)
- OKF second brain: `events/2026-05-03-...-ayaan-virani-asks-if-an-undecided-button-can-be-added...md` (direct user request)
- `app/components/queue/QueueTable.tsx:531` (hardcoded disposition badges: completed|failed|no-answer|voicemail|unknown)
