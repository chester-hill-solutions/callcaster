# Toll-free verification plan (design only)

## Context

CallCaster currently supports Canadian local number search and US/CA business profiles in onboarding. Toll-free senders require Twilio Toll-Free Verification before high-volume US messaging.

## Scope decision

- **Phase 1 (document only):** Detect toll-free numbers in workspace inventory; surface readiness warnings in onboarding and admin health.
- **Phase 2 (API):** Integrate Twilio Toll-Free Verification API when product adds US/CA toll-free purchase.

## Required business data (Twilio)

- Business name, website, use case description
- Opt-in workflow and sample messages
- Contact email for verification updates
- EIN or equivalent for US entities (when applicable)

## UI steps (future)

1. Channels step: optional “Toll-free SMS” when TF numbers present.
2. Dedicated verification form mirroring A2P business profile fields.
3. Status badge: pending / approved / rejected with rejection reason.
4. Block campaign SMS sends when TF number selected and verification not approved.

## Canadian product note

Current number search is CA-local only (`numbers.loader.server.ts`). Toll-free verification applies when TF numbers are added to inventory (manual Console or future purchase flow).
