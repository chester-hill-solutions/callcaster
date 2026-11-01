import { createHash } from "node:crypto";
import postgres from "postgres";
import { workspaceResourceName } from "../../app/lib/twilio-resource-name.ts";

export class NameBackfillError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const REQUIRED_SOURCES = ["dev", "qa", "production"];

/** Only non-secret ownership columns leave the read-only transaction. */
export function createOwnershipReader(databases) {
  const connections = databases.map(({ environment, url }) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new NameBackfillError(`Invalid database URL for ${environment}`);
    }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol))
      throw new NameBackfillError(
        `Invalid database protocol for ${environment}`,
      );
    return { environment, sql: postgres(url, { max: 1 }) };
  });
  return {
    async read() {
      return Promise.all(
        connections.map(async ({ environment, sql }) => {
          try {
            return await sql.begin("read only", async (tx) => {
              const [database] = await tx`SELECT current_database() AS database,
              inet_server_addr()::text AS host, inet_server_port() AS port`;
              const identity = createHash("sha256")
                .update(JSON.stringify(database))
                .digest("hex");
              const workspaces = await tx`
            WITH owners AS (
              SELECT id, name, to_jsonb(w)->>'archived_at' AS archived_at,
                     to_jsonb(w) ? 'archived_at' AS archive_supported,
                     CASE WHEN jsonb_typeof(twilio_data::jsonb) = 'string'
                       THEN (twilio_data::jsonb #>> '{}')::jsonb
                       ELSE twilio_data::jsonb END AS account
              FROM workspace w
            )
            , ownership AS (
              SELECT id, name, archived_at, archive_supported,
                     ARRAY(SELECT DISTINCT sid FROM unnest(ARRAY[
                       NULLIF(trim(account->>'sid'), ''),
                       NULLIF(trim(account->>'account_sid'), ''),
                       NULLIF(trim(account->>'accountSid'), '')
                     ]) AS refs(sid) WHERE sid IS NOT NULL ORDER BY sid) AS account_sids
              FROM owners
            )
            SELECT id, name, archived_at, archive_supported, account_sids,
                   CASE WHEN cardinality(account_sids) = 1 THEN account_sids[1]
                        ELSE NULL END AS account_sid
            FROM ownership ORDER BY id
            `;
              return { environment, identity, workspaces };
            });
          } catch {
            throw new NameBackfillError(
              `Cannot read workspace ownership for ${environment}`,
            );
          }
        }),
      );
    },
    async close() {
      await Promise.all(connections.map(({ sql }) => sql.end({ timeout: 5 })));
    },
  };
}

function sourceBindings(sources, environment) {
  const names = sources.map((s) => s.environment);
  if (!["dev", "qa"].includes(environment) || !names.includes(environment))
    throw new NameBackfillError(
      "Select the dev or qa target database explicitly",
    );
  if (
    new Set(names).size !== names.length ||
    REQUIRED_SOURCES.some((n) => !names.includes(n))
  )
    throw new NameBackfillError(
      "Provide distinct dev, qa and production ownership sources",
    );
  if (new Set(sources.map((s) => s.identity)).size !== sources.length)
    throw new NameBackfillError(
      "Ownership sources must not point to the same database",
    );
  return sources
    .map(({ environment: name, identity }) => ({ environment: name, identity }))
    .sort((a, b) => a.environment.localeCompare(b.environment));
}

function accountReferences(workspace) {
  return new Set(
    [workspace.account_sid, ...(workspace.account_sids ?? [])]
      .filter((sid) => typeof sid === "string" && sid.trim())
      .map((sid) => sid.trim()),
  );
}

/** Never infer ownership from a name alone: the database SID must also match. */
export function buildNameBackfillPlan({
  environment,
  sources,
  parent,
  accounts,
}) {
  const databases = sourceBindings(sources, environment);
  if (!ACCOUNT_SID.test(parent.sid) || parent.ownerAccountSid !== parent.sid)
    throw new NameBackfillError(
      "The credential must identify the parent Twilio account",
    );
  const bySid = new Map(accounts.map((a) => [a.sid, a]));
  if (bySid.size !== accounts.length)
    throw new NameBackfillError("Duplicate account in Twilio inventory");
  const target = sources.find((s) => s.environment === environment).workspaces;
  const entries = target
    .map((workspace) => {
      const references = accountReferences(workspace);
      const sid = references.size === 1 ? [...references][0] : null;
      const account = bySid.get(sid);
      const before = account?.friendlyName ?? null;
      // Accounts have a 64-character limit. Keep the identifying suffix intact.
      const after = workspaceResourceName(workspace.name, workspace.id, 64);
      const legacyName =
        UUID.test(before ?? "") &&
        before.toLowerCase() === workspace.id.toLowerCase();
      let reason;
      if (references.size > 1) reason = "Conflicting stored account IDs";
      else if (!UUID.test(workspace.id) || !ACCOUNT_SID.test(sid ?? ""))
        reason = "Missing valid workspace or account ID";
      else if (sid === parent.sid) reason = "Parent account is protected";
      else if (workspace.archive_supported !== true)
        reason = "Workspace archive state is unavailable";
      else if (workspace.archived_at)
        reason = "Archived workspace is protected";
      else if (target.filter((w) => accountReferences(w).has(sid)).length !== 1)
        reason = "Multiple target workspaces reference this account";
      else if (
        sources.some(
          (s) =>
            s.environment !== environment &&
            s.workspaces.some((w) => accountReferences(w).has(sid)),
        )
      )
        reason = "Another environment references this account";
      else if (!account)
        reason = "Account is absent from the complete inventory";
      else if (account.ownerAccountSid !== parent.sid)
        reason = "Account belongs to another parent";
      else if (account.status !== "active") reason = "Account is not active";
      else if (after === workspace.id)
        reason = "Workspace has no usable display name";
      else if (!legacyName && before !== after)
        reason = "Custom or unmatched account name is protected";
      return {
        workspaceId: workspace.id,
        accountSid: sid ?? null,
        before,
        after,
        action: reason ? "blocked" : before === after ? "unchanged" : "rename",
        reason:
          reason ??
          (before === after
            ? "Already named"
            : "Legacy UUID matches its workspace"),
      };
    })
    .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
  return {
    version: 1,
    environment,
    parentAccountSid: parent.sid,
    databases,
    entries,
  };
}

export async function readNameBackfillPlan({
  client,
  readSources,
  environment,
}) {
  const parent = await client.api.v2010.accounts(client.accountSid).fetch();
  const sources = await readSources();
  // pageSize controls each page; no limit may truncate the inventory.
  const accounts = await client.api.v2010.accounts.list({ pageSize: 1000 });
  return buildNameBackfillPlan({ environment, sources, parent, accounts });
}

function approvedEntry(plan, entry) {
  const current = plan.entries.find(
    (e) =>
      e.workspaceId === entry.workspaceId && e.accountSid === entry.accountSid,
  );
  if (
    !current ||
    !["rename", "unchanged"].includes(current.action) ||
    current.after !== entry.after ||
    (current.action === "rename" && current.before !== entry.before)
  )
    throw new NameBackfillError(
      `Ownership or naming changed for workspace ${entry.workspaceId}; generate a new plan`,
    );
  return current;
}

/** Apply only reviewed legacy renames. Replays are no-ops; custom names survive. */
export async function applyNameBackfillPlan({
  client,
  readSources,
  approved,
  onApplied = () => {},
}) {
  if (approved?.version !== 1 || !Array.isArray(approved.entries))
    throw new NameBackfillError("Invalid reviewed plan");
  const options = { client, readSources, environment: approved.environment };
  const fresh = await readNameBackfillPlan(options);
  if (
    fresh.parentAccountSid !== approved.parentAccountSid ||
    JSON.stringify(fresh.databases) !== JSON.stringify(approved.databases)
  )
    throw new NameBackfillError(
      "Reviewed parent account or database bindings changed",
    );
  const candidates = approved.entries.filter((e) => e.action === "rename");
  if (new Set(candidates.map((e) => e.accountSid)).size !== candidates.length)
    throw new NameBackfillError("Duplicate rename in reviewed plan");
  // Validate the entire reviewed set before the first write.
  for (const entry of candidates) approvedEntry(fresh, entry);
  const results = [];
  for (const entry of candidates) {
    // Recheck database ownership and provider state immediately before each write.
    const sources = await readSources();
    if (
      JSON.stringify(sourceBindings(sources, approved.environment)) !==
      JSON.stringify(fresh.databases)
    )
      throw new NameBackfillError("Database bindings changed during apply");
    const account = await client.api.v2010.accounts(entry.accountSid).fetch();
    const check = buildNameBackfillPlan({
      environment: approved.environment,
      sources,
      parent: {
        sid: fresh.parentAccountSid,
        ownerAccountSid: fresh.parentAccountSid,
      },
      accounts: [account],
    });
    const current = approvedEntry(check, entry);
    if (current.action === "unchanged") {
      results.push({ accountSid: entry.accountSid, action: "unchanged" });
      continue;
    }
    const updated = await client.api.v2010
      .accounts(entry.accountSid)
      .update({ friendlyName: current.after });
    if (
      updated.friendlyName !== current.after ||
      updated.sid !== entry.accountSid ||
      updated.ownerAccountSid !== fresh.parentAccountSid ||
      updated.status !== "active"
    )
      throw new NameBackfillError(
        `Rename could not be verified for workspace ${entry.workspaceId}; inspect before retrying`,
      );
    const result = {
      workspaceId: entry.workspaceId,
      accountSid: entry.accountSid,
      before: current.before,
      after: current.after,
      action: "renamed",
    };
    results.push(result);
    await onApplied(result);
  }
  return results;
}
