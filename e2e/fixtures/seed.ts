/** Deterministic E2E seed identifiers — must match scripts/e2e/seed-database.mjs */
export const E2E_PASSWORD = "E2eTestPass1!";

export const E2E_USERS = {
  owner: { id: "b1000000-0000-4000-8000-000000000001", email: "owner@e2e.test" },
  admin: { id: "b1000000-0000-4000-8000-000000000002", email: "admin@e2e.test" },
  member: { id: "b1000000-0000-4000-8000-000000000003", email: "member@e2e.test" },
  caller: { id: "b1000000-0000-4000-8000-000000000004", email: "caller@e2e.test" },
  sudo: { id: "b1000000-0000-4000-8000-000000000005", email: "sudo@e2e.test" },
  invitee: { id: "b1000000-0000-4000-8000-000000000006", email: "invitee@e2e.test" },
  authflow: { id: "b1000000-0000-4000-8000-000000000007", email: "authflow@e2e.test" },
} as const;

export const E2E_WORKSPACES = {
  ready: {
    id: "a0000000-0000-4000-8000-000000000001",
    name: "E2E Ready Workspace",
  },
  onboarding: {
    id: "a0000000-0000-4000-8000-000000000002",
    name: "E2E Onboarding Workspace",
  },
  empty: {
    id: "a0000000-0000-4000-8000-000000000003",
    name: "E2E Empty Workspace",
  },
} as const;

export const E2E_CAMPAIGNS = {
  liveCall: { id: 910001, title: "E2E Live Call" },
  livePredictive: { id: 910002, title: "E2E Predictive Live" },
  message: { id: 910003, title: "E2E Message Campaign" },
  robocall: { id: 910004, title: "E2E Robocall" },
  archived: { id: 910005, title: "E2E Archived Campaign" },
} as const;

export const E2E_AUDIENCE = { id: 920001, name: "E2E Audience" };
export const E2E_CONTACTS = {
  primary: { id: 930001, phone: "+15555501002" },
  secondary: { id: 930002, phone: "+15555501003" },
} as const;
export const E2E_WORKSPACE_NUMBER = { id: 940001, phone: "+15555501001" };
export const E2E_SCRIPT = { id: 950001, name: "E2E Live Script" };
export const E2E_IVR_SCRIPT = { id: 950002, name: "E2E IVR Script" };
export const E2E_SURVEY = { id: 960001, publicId: "e2e-survey-public" };
export const E2E_API_KEY = {
  id: "c1000000-0000-4000-8000-000000000001",
  prefix: "cc_e2e",
  plaintext: "cc_e2e_test_key_for_api_calls_only",
};

export const SEED_VERSION = "e2e-v1";

export function workspacePath(workspaceId: string, suffix = ""): string {
  const base = `/workspaces/${workspaceId}`;
  return suffix ? `${base}/${suffix.replace(/^\//, "")}` : base;
}
