#!/usr/bin/env node
/**
 * Read-only Twilio subaccount inventory: what exists, and what each one holds?
 *
 * Usage:
 *   node --env-file=.env scripts/twilio-subaccount-inventory.mjs
 *   TWILIO_SID=... TWILIO_AUTH_TOKEN=... node scripts/twilio-subaccount-inventory.mjs
 *
 * Read-only by design, in the same spirit as `cull-report.mjs`: the output is
 * evidence for a decision, not the decision. Every call here is a `list()`.
 *
 * ## Why this exists
 *
 * Subaccounts used to be created with the raw workspace UUID as the friendly
 * name, so the Twilio console is a wall of UUIDs. `workspaceResourceName` fixed
 * the naming for new subaccounts but did nothing about the existing ones.
 *
 * The first survey of the account (2026-09-29) found 192 subaccounts, 183 of
 * them legacy-named, and this is the script that produced those numbers. It
 * exists so the next survey is a command rather than an afternoon.
 *
 * ## Empty is not the same as safe
 *
 * That survey classified 142 subaccounts as "empty" — no phone numbers, no
 * message history. Cross-checking them against the databases showed **31
 * belonged to live workspaces**, one holding 7,704 contacts. An empty
 * subaccount is a customer who has not rented a number yet.
 *
 * There is also no dev-only silo: dev, staging and production all share one
 * Twilio account, so a subaccount absent from the dev database may still belong
 * to a production workspace.
 *
 * ## There is no delete path, and that is Twilio's doing
 *
 * `twilio` v5 exposes only `create`, `fetch` and `update` on an account — no
 * `remove`. Subaccount deletion is a Console-only action. A cull script was
 * written and then deleted rather than shipped half-working; this report is
 * what a reviewer needs in order to do the deletion by hand, correctly.
 */
const accountSid = process.env.TWILIO_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("TWILIO_SID / TWILIO_AUTH_TOKEN are not set.");
  console.error(
    "Run with: node --env-file=.env scripts/twilio-subaccount-inventory.mjs",
  );
  process.exit(1);
}

const { default: TwilioSdk } = await import("twilio");
const api = new TwilioSdk.Twilio(accountSid, authToken).api.v2010;

/** The legacy scheme: the raw workspace uuid as the whole friendly name. */
const LEGACY_UUID_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The current scheme: `Workspace Name · <first 8 of the uuid>`. */
const CURRENT_NAME = / · [0-9a-f]{8}$/i;

const rows = [];
// twilio v4 `list()` resolves to an array rather than an async iterable.
for (const sub of await api.accounts.list({ limit: 200 })) {
  const name = sub.friendlyName ?? "";
  rows.push({
    sid: sub.sid,
    status: sub.status,
    name: name || "(no friendly name)",
    created: sub.dateCreated
      ? new Date(sub.dateCreated).toISOString().slice(0, 10)
      : "?",
    scheme: LEGACY_UUID_NAME.test(name)
      ? "legacy-uuid"
      : CURRENT_NAME.test(name)
        ? "current"
        : "unrecognised",
    // The 8-char id suffix the current scheme embeds: the handle back to the
    // workspace row.
    hint: (name.match(/ · ([0-9a-f]{8})$/i) ?? [])[1] ?? "-",
  });
}

rows.sort((a, b) => a.created.localeCompare(b.created));

const pad = (value, width) => String(value ?? "").padEnd(width).slice(0, width);

console.log(`\nTwilio account ${accountSid} — ${rows.length} subaccount(s)\n`);
console.log(`  ${pad("CREATED", 11)}${pad("SCHEME", 15)}${pad("STATUS", 10)}${pad("NAME", 44)}${pad("WS", 9)}SID`);
console.log(`  ${"-".repeat(100)}`);
for (const r of rows) {
  console.log(
    `  ${pad(r.created, 11)}${pad(r.scheme, 15)}${pad(r.status, 10)}${pad(r.name, 44)}${pad(r.hint, 9)}${r.sid}`,
  );
}

const byScheme = rows.reduce(
  (acc, r) => ({ ...acc, [r.scheme]: (acc[r.scheme] ?? 0) + 1 }),
  {},
);
console.log(`\n  by naming scheme: ${JSON.stringify(byScheme)}`);

const notActive = rows.filter((r) => r.status !== "active");
if (notActive.length > 0) {
  console.log(
    `  not active (${notActive.length}): ${notActive.map((r) => `${r.sid} ${r.status}`).join(", ")}`,
  );
}

console.log("\n  resources per subaccount:");
for (const r of rows) {
  const sub = api.accounts(r.sid);
  const numbers = await sub.incomingPhoneNumbers.list({ limit: 20 });
  const messages = (await sub.messages.list({ limit: 200 })).length;
  console.log(
    `    ${r.sid}  numbers=${String(numbers.length).padStart(2)}  messages(sampled)=${String(messages).padStart(3)}  ${r.name.slice(0, 40)}`,
  );
}

console.log("\n  GET calls only. Nothing was deleted or modified.\n");
