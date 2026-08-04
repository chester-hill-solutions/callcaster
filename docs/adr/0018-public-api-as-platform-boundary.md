# Public API as platform boundary

CallCaster's public API (`/api/*` routes) is a stable integration surface consumed by other chester-hill apps (notably Adagio) via the `@chester-hill-solutions/scriptkit-callcaster-client` HTTP client. v2 changes must preserve backward compatibility for these consumers. The API contract is the integration surface, not the DB schema — internal schema changes (ADR-0015, table pruning) don't break consumers as long as the API shape is maintained. Adagio's `providers/callcaster/` adapter drives CallCaster via `createCallCasterClient`, `authenticateAgent`, `createWorkspace`, `createApiKey`, `createCampaignWithScript`, `sendSms`, `sendChatSms`, `listAudiences`, `uploadAudience`. The reference doc `docs/reference/callcaster-provision-api.md` in the chs monorepo is the spec.

## References

- chs `packages/scriptkit-callcaster-client/` (HTTP client), chs `docs/reference/callcaster-provision-api.md`, `app/lib/openapi.ts` (spec served at `/api/docs/openapi`), `app/lib/api-surface.ts` (complete route inventory)
