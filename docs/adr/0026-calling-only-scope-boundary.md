# Calling-only scope boundary; canvassing lives in quick-canvass

CallCaster is a calling and SMS platform. Canvassing (door-knocking, walk lists, turf management) lives in quick-canvass — a separately developed sibling product in the chester-hill-solutions ecosystem. The two coordinate via the `@chester-hill-solutions/pg-realtime` shared event bus (ADR-0005) and a future shared voter data layer. Building canvassing into CallCaster would duplicate an actively-developed product (quick-canvass has offline outbox, IndexedDB sync, PostGIS geocoding, turf optimization — none of which CallCaster needs). The product decision is explicit: "Canvassing needs to be its own special product" (OKF second brain, 2026-06-07). CallCaster's competitive differentiation against CallFire is typed 1-5 dispositions (ADR-0019), three-phase model (ADR-0020), voter list lifecycle (ADR-0023), and household entity (ADR-0021) — not canvassing features.

## References

- OKF second brain: `events/2026-06-07-...-noah-and-nathaniel-discuss-different-approaches-to-canvassing...md` ("Canvassing needs to be its own special product"; "North star is to replicate MiniVAN")
- quick-canvass `app/db/schema.ts` (canvass_lists, turfs, turf_households, list_households tables — canvassing domain)
- `@chester-hill-solutions/pg-realtime` (shared event bus for cross-app coordination)
