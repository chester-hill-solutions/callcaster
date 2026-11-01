import postgres from "postgres";

export async function readDatabaseEvidence({ databaseUrl, activeWindowDays, usePublicUrl = false }) {
  if (!databaseUrl) {
    return {
      source: "not configured",
      workspaceIds: [],
      workspaceNames: new Map(),
      activeWorkspacePrefixes: new Set(),
      numberSids: new Set(),
      accounts: [],
    };
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    ...(usePublicUrl ? { ssl: false } : {}),
  });

  try {
    // One query, shaped like scripts/cull-report.mjs, which already reads
    // these tables: a workspace with no activity still has to appear.
    const accountRows = await sql.unsafe(`
      WITH act AS (
        SELECT w.id,
               GREATEST(max(c.date_created), max(m.date_created), max(camp.created_at)) AS last_any
        FROM workspace w
        LEFT JOIN call c        ON c.workspace = w.id
        LEFT JOIN message m     ON m.workspace = w.id
        LEFT JOIN campaign camp ON camp.workspace = w.id
        GROUP BY w.id
      ),
      nums AS (
        SELECT workspace,
               count(*) FILTER (WHERE type = 'rented')::int    AS rented,
               count(*) FILTER (WHERE type = 'caller_id')::int AS caller_id,
               count(*)::int                                   AS total
        FROM workspace_number
        WHERE status = 'active'
        GROUP BY workspace
      )
      SELECT w.id, w.name,
             act.last_any::text AS last_any,
             COALESCE(nums.total, 0)::int     AS numbers_total,
             COALESCE(nums.rented, 0)::int    AS rented,
             COALESCE(nums.caller_id, 0)::int AS caller_id
      FROM workspace w
      LEFT JOIN act  ON act.id = w.id
      LEFT JOIN nums ON nums.workspace = w.id
      ORDER BY act.last_any DESC NULLS LAST, w.name
    `);

    const numberRows = await sql`
      SELECT twilio_phone_number_sid, workspace
      FROM workspace_number
      WHERE status = 'active' AND twilio_phone_number_sid IS NOT NULL
    `;

    const cutoff = Date.now() - activeWindowDays * 86_400_000;
    const accounts = accountRows.map((row) => {
      const lastActivity = row.last_any ? new Date(row.last_any) : null;
      const active = lastActivity ? lastActivity.getTime() >= cutoff : false;
      return {
        id: row.id,
        name: row.name,
        lastActivity: lastActivity ? lastActivity.toISOString() : null,
        active,
        numbersTotal: row.numbers_total,
        rented: row.rented,
        callerId: row.caller_id,
      };
    });

    const workspaceNames = new Map(
      accountRows.map((row) => [String(row.name ?? "").trim().toLowerCase(), row]),
    );

    return {
      source: `${accountRows.length} workspaces, ${numberRows.length} workspace numbers`,
      workspaceIds: accountRows.map((row) => row.id),
      workspaceNames,
      activeWorkspacePrefixes: new Set(
        accounts.filter((account) => account.active).map((account) => account.id.slice(0, 8).toLowerCase()),
      ),
      numberSids: new Set(numberRows.map((row) => row.twilio_phone_number_sid)),
      accounts,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}
