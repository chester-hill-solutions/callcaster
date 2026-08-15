# API surface migration audit

A one-time record of the migration in issue #1242 (D4), which replaced the
hand-maintained `API_SURFACE` literal — 1,760 lines across four files — with a
generated core (`app/lib/api-surface-generated.ts`) plus a hand-written
editorial map (`app/lib/api-surface-annotations.ts`).

The literal could only be deleted once every difference between it and the
generated output was accounted for. This is that accounting.

**Reproducing it.** The comparison mode takes a JSON snapshot of the old
literal:

```sh
git show <parent-of-the-migration-commit>:app/lib/api-surface.ts   # the literal still exists there
# dump API_SURFACE to snapshot.json from that revision, then:
npm run tools:api:surface:generate
tsx --tsconfig tsconfig.json scripts/generate-api-surface.ts --compare snapshot.json
```

---

- literal entries: **146**
- generated entries: **145**
- entries matching field-for-field: **141**
- authClass derived authoritatively: **55**
- authClass declared and constrained by auth evidence: **65**
- authClass declared with no mechanical corroboration: **25**

## Drift — the literal was wrong about the code

Five findings. In each the generated side wins, because in each the literal was
describing something the code does not do.

- **Phantom entry** `/api/workspaces/:workspaceId`
  (`app/routes/api+/workspaces+/$workspaceId.tsx`) — the inventory declared
  `GET:loader`, but the module has no loader/action export. It is the data-plane
  layout: middleware and an `<Outlet/>`, nothing callable. Its own note said so
  ("no direct handler") while its `operations` array claimed a GET.

  This one had teeth. The real handler for that path is the child index
  (`$workspaceId/route.tsx`), and both entries declared the same path. The
  layout sorted last, so it **overwrote the real entry** when the OpenAPI
  builder keyed paths — the published spec advertised `session` auth for
  `GET /api/workspaces/{workspaceId}` when the route actually accepts an API key
  and enforces `campaigns.read`. That is the unenforced cross-file ordering
  invariant causing real damage to the contract, which is the strongest
  argument available for deriving order rather than curating it.

- **Operations** `/api/workspaces/:workspaceId/billing` — inventory declared
  `GET:loader`, the route shim exports `GET:loader,POST:action`. An undocumented
  POST endpoint.

- **Operations** `/api/workspaces/:workspaceId/conversations/:contactNumber` —
  same shape: an undocumented POST.

- **authClass** `/api/call` — inventory said `internalTrusted`;
  `requireTwilioSignature` in the auth strategy enforces `twilioSignature`. The
  entry's `securityWarning` also claimed "Twilio Voice URL without signature
  validation", which is false — the validation is right there in the strategy,
  and `shouldValidateTwilioWebhooks()` cannot be switched off in production. The
  warning is replaced with a note describing what the code does.

- **authClass** `/api/inbound-verification` — inventory said `internalTrusted`;
  the strategy is `requireTwilioSignature`, so `twilioSignature`. This entry
  already contradicted itself: its `securityWarning` correctly described
  main-account signature validation while its `authClass` said otherwise.

## Generator gaps — the literal knew something the generator cannot derive

_none_. Every capability the literal declared is reproduced: 23 from
capability-carrying strategies and 7 from `scripts/capability-baseline.json`,
which the generator reads rather than guesses at, marking each
`capabilitySource: "baseline"`.

## Effect on the published OpenAPI

`openapi/integrator-api.json` is **byte-identical**, and so is the generated SDK
in `app/lib/api-generated/` — the ADR-0018 platform boundary is untouched.

`public-api.json` and `complete-api.json` differ. Compared as key-sorted JSON,
the *entire* semantic difference is 89 leaf values, all of them the drift
corrections above:

| Spec | Path | Change |
| --- | --- | --- |
| public, complete | `/api/workspaces/{workspaceId}/billing` | `post` added (20 leaves) |
| public, complete | `/api/workspaces/{workspaceId}/conversations/{contactNumber}` | `post` added (20 leaves) |
| complete | `/api/call` | `internalTrusted` → `twilioSignature` (tags, auth class) |
| complete | `/api/inbound-verification` | `internalTrusted` → `twilioSignature` |
| complete | `/api/workspaces/{workspaceId}` | `get` now the child index: `apiKeyOrSession`, `campaigns.read`, API-key security scheme, correct description |

The raw byte diff is much larger than that because entries now sort by path, so
JSON keys are emitted in a different order. Ordering carries no meaning in JSON
and no consumer depends on it; the key-sorted comparison above is the one that
matters.

## Routes whose declared authClass has no mechanical corroboration

These use a hand-rolled preamble the analyser cannot classify, so the
annotation's `authClass` is taken on trust. Each one that grows a
self-describing auth strategy moves into the derived set — the same ratchet
shape as the capability baseline.

- `/api/audience-upload` — `action:no-auth-strategy`
- `/api/audiences` — `action:no-auth-strategy + loader:no-auth-strategy`
- `/api/audiodrop` — `action:no-auth-strategy`
- `/api/auth/*` — `action:no-auth-strategy + loader:no-auth-strategy`
- `/api/auth/callback` — `loader:no-auth-strategy`
- `/api/auth/signout` — `action:unrecognised`
- `/api/connect-campaign-conference/:workspaceId/:campaignId` — `loader:unrecognised`
- `/api/connect-phone-device` — `action:unrecognised`
- `/api/contact-form` — `action:no-auth-strategy`
- `/api/contacts` — `action:requireDualAuth + loader:no-auth-strategy`
- `/api/docs/openapi` — `loader:no-auth-strategy`
- `/api/docs/openapi/all` — `loader:no-auth-strategy`
- `/api/jobs/billing-reconcile` — `action:no-auth-strategy`
- `/api/jobs/low-credit-notify` — `action:no-auth-strategy`
- `/api/jobs/number-rental-billing` — `action:no-auth-strategy`
- `/api/jobs/twilio-open-sync` — `action:no-auth-strategy`
- `/api/outreach_attempts/:id` — `action:unrecognised`
- `/api/stripe-webhook` — `action:unrecognised`
- `/api/survey-answer` — `action:no-auth-strategy`
- `/api/survey-complete` — `action:no-auth-strategy`
- `/api/survey-responses` — `action:no-auth-strategy`
- `/api/twilio/trusthub/status` — `action:no-auth-strategy`
- `/api/verify-audio-pin/:pin` — `loader:no-auth-strategy`
- `/api/verify-audio-session` — `action:no-auth-strategy + loader:no-auth-strategy`
- `/api/verify-pin-input` — `action:no-auth-strategy`

## Declared authClasses this migration did NOT change

A route-level audit run alongside the migration found six more entries whose
declared `authClass` looks wrong. The generator does **not** correct these,
because in each case its evidence is a base helper rather than an authoritative
strategy, and a base establishes a floor — the real gate can sit several frames
deeper in the service layer, where no route-level analyser can see it. Silently
downgrading a security-relevant published field on that evidence would be worse
than leaving it stale.

They are recorded here for a follow-up that can adjudicate each one properly.

| Route | Declared | Audit finding |
| --- | --- | --- |
| `/api/agent-status` | `workspaceAdmin` | `requireJsonAuth` + `requireWorkspaceAccess` with **no** `minRole` — membership only, so `session`. |
| `/api/test-webhook` | `workspaceAdmin` | `requireJsonAuth` and no workspace or role check at all; `workspaceScoped: true` is also wrong. Any signed-in user can drive an outbound POST (bounded only by the SSRF guard). |
| `/api/workspace-api-keys` | `workspaceAdmin` | The floor is `requireMemberManager`, which denies only `caller` — a **member** floor, not admin. Worth noting separately: a plain member can mint a key with any capability scope. |
| `/api/message_media` | `session` | `requireDualAuth`, and the `authType === "api_key"` branch **admits** keys — so `apiKeyOrSession`. `exposure: sessionOnly` is wrong for the same reason. |
| `/api/workspaces/:workspaceId/members` | `workspaceAdmin` | Loader is `dataPlaneSessionMinRoleAuth(MemberRole.Caller)` — any member. POST admits API keys via `members.invite`. Nothing here is admin-gated. |
| `/api/workspaces/:workspaceId` | `apiKeyOrSession` | Correct for GET; the action is `dataPlaneSessionMinRoleAuth(MemberRole.Caller)`, session-only, with admin/owner gates applied per-method in the service layer. |

The last row points at a structural limit worth naming: `authClass` is one field
per entry, but auth is enforced per method. Where a route's GET and PATCH differ,
no single value is honest, and the entry-level class the generator computes is
the most permissive handler's — what an integrator needs to know to reach the
surface at all. The prose in `notes` carries the per-method detail.
