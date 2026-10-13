import { DEV_CULL_KEEP_WORKSPACE_IDS } from "./cull-keep-list.mjs";

const PHONE_NAMED = /^\+?[\d][\d\s().-]{5,}$/;

const ageDays = (iso, now) =>
  iso ? (now - new Date(iso).getTime()) / 86_400_000 : null;

/** Apply the cull rules to one workspace. The repository keep-list wins first. */
export function workspaceCullVerdict(
  row,
  {
    windowDays = 60,
    junkFragments = [],
    now = Date.now(),
    keepWorkspaceIds = DEV_CULL_KEEP_WORKSPACE_IDS,
  } = {},
) {
  if (keepWorkspaceIds.includes(row.id)) {
    return {
      verdict: "KEEP",
      why: "keep-list",
      ageDays: ageDays(row.last_any, now),
    };
  }

  const junk = junkFragments.find((fragment) =>
    (row.name ?? "").toLowerCase().includes(fragment),
  );
  if (junk) {
    return {
      verdict: "CULL",
      why: `name matches "${junk}"`,
      ageDays: ageDays(row.last_any, now),
    };
  }

  if (PHONE_NAMED.test(row.name ?? "")) {
    return {
      verdict: "CULL",
      why: "named after a phone number",
      ageDays: ageDays(row.last_any, now),
    };
  }

  const age = ageDays(row.last_any, now);
  if (age === null)
    return { verdict: "CULL", why: "no activity ever", ageDays: null };
  if (age <= windowDays) {
    return {
      verdict: "KEEP",
      why: `active ${age.toFixed(0)}d ago`,
      ageDays: Math.round(age),
    };
  }
  return {
    verdict: "CULL",
    why: `last activity ${age.toFixed(0)}d ago`,
    ageDays: Math.round(age),
  };
}
