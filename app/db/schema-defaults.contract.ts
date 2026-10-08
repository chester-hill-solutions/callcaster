/**
 * Compile-time contract for the schema defaults guard (#2243). **Never
 * executed** — `npm run typecheck` is the assertion.
 *
 * It lives under `app/` rather than in `test/` because tsconfig excludes test
 * files by glob, so a type-level assertion in a suite is checked by nothing. The
 * same reason `writeBoundaryContract` sits in `app/server/tenant-db.ts`: a guard
 * that no command runs is a comment.
 *
 * ## What it guards
 *
 * The drift guard in `test/integration-db/schema-default-drift.test.ts` compares
 * the database against the model and needs a live database. This file guards the
 * *consequence* of that fix with no database at all: a column whose default the
 * database supplies must be **optional** in `InferInsertModel`.
 *
 * That is the whole defect. A `NOT NULL DEFAULT now()` column declared
 * `text().notNull()` with no `.default()` is marked required, so every caller
 * must invent the value, and the honest-looking fix at a call site is
 * `created_at: new Date().toISOString()` — a client clock on a column the
 * database was always going to fill in.
 *
 * ## Why each assertion is shaped the way it is
 *
 * `T extends { col?: unknown } ? true : never` **distributes nothing and accepts
 * no value**, so it cannot be satisfied by an index signature, a mapped type or
 * an `any`. Each alias resolves to `true` or to `never`; `never` makes the
 * `satisfies true` fail.
 *
 * The object literals are the other half, and the reason they matter: they prove
 * the *remaining* required properties are genuinely required. If a default were
 * added to the wrong column, these literals would stop compiling.
 */
import type {
  CampaignInsert,
  ContactInsert,
  ScriptInsert,
  SurveyInsert,
  SurveyQuestionInsert,
  WebhookInsert,
  WorkspaceInsert,
  WorkspaceInviteInsert,
  WorkspaceNumberInsert,
  WorkspaceUsersInsert,
} from "@/lib/db-types";

/** Optional iff the model declares a default the database also supplies. */
type IsOptional<T, K extends string> = T extends Record<K, unknown>
  ? false
  : T extends Partial<Record<K, unknown>>
    ? true
    : never;

type Assert<T extends true> = T;

// ── now() defaults ──────────────────────────────────────
// Every one of these is `text().notNull()` in the model and
// `NOT NULL DEFAULT now()` in the database. Text is itself #2213 drift; the
// default is still the database's to supply.
export type _WorkspaceCreatedAt = Assert<IsOptional<WorkspaceInsert, "created_at">>;
export type _ContactCreatedAt = Assert<IsOptional<ContactInsert, "created_at">>;
export type _ScriptCreatedAt = Assert<IsOptional<ScriptInsert, "created_at">>;
export type _CampaignCreatedAt = Assert<IsOptional<CampaignInsert, "created_at">>;
export type _SurveyCreatedAt = Assert<IsOptional<SurveyInsert, "created_at">>;

// ── boolean defaults ────────────────────────────────────
// "Off unless set" is real semantics — a boolean default is never scaffolding.
export type _WorkspaceDisabled = Assert<IsOptional<WorkspaceInsert, "disabled">>;
export type _WorkspaceInviteIsNew = Assert<IsOptional<WorkspaceInviteInsert, "isNew">>;

// ── scalar and enum defaults ────────────────────────────
export type _WorkspaceUsersRole = Assert<IsOptional<WorkspaceUsersInsert, "role">>;
export type _WorkspaceInviteRole = Assert<IsOptional<WorkspaceInviteInsert, "role">>;
export type _WebhookType = Assert<IsOptional<WebhookInsert, "type">>;
export type _SurveyTitle = Assert<IsOptional<SurveyInsert, "title">>;
export type _SurveyQuestionIsRequired = Assert<
  IsOptional<SurveyQuestionInsert, "is_required">
>;
// A nonzero number is a product decision (four rings by default), not a
// placeholder — the guard models it for the same reason.
export type _WorkspaceInboundRingCount = Assert<
  IsOptional<WorkspaceNumberInsert, "inbound_ring_count">
>;

// ── generated keys ──────────────────────────────────────
// `text().notNull().primaryKey().default(sql\`gen_random_uuid()\`)`. Optional means
// an insert can omit the key, which is the point.
export type _WorkspaceInviteId = Assert<IsOptional<WorkspaceInviteInsert, "id">>;

// ── the counterweight: the required properties stay required ──
//
// Without these, a guard that made *everything* optional would pass every
// assertion above. Each literal supplies only what is genuinely required, so a
// default added to the wrong column breaks the build.
// `workspace` is required on every one of these: it is the tenancy column, and
// `createTenantDb` injects it on insert rather than letting a caller supply it.
export const minimalCampaign = { workspace: "w", title: "x" } satisfies CampaignInsert;
export const minimalSurvey = {
  workspace: "w",
  survey_id: "y",
} satisfies SurveyInsert;
export const minimalWebhook = {
  workspace: "w",
  destination_url: "https://example.com",
} satisfies WebhookInsert;
export const minimalWorkspaceInvite = {
  workspace: "w",
  user_id: "u",
} satisfies WorkspaceInviteInsert;