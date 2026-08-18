/**
 * API `Idempotency-Key` replay store.
 *
 * Backed by Postgres, not process memory. The previous `Map` was void across
 * restarts and across any second replica, and it gated Stripe checkout-session
 * creation — so a client retrying after a deploy could create a SECOND checkout
 * session for the same key. The ledger's idempotency is already DB-enforced;
 * this brings the HTTP layer in line.
 *
 * Under Vitest an in-memory backend is used so route tests need no database,
 * mirroring `platform-rate-limit.server.ts`.
 */
import { and, eq, lt } from "drizzle-orm";

import { idempotency_record } from "@/db/schema";
import { db } from "@/server/db";
import { logger } from "@/lib/logger.server";

type IdempotencyRecord = {
  status: number;
  body: string;
  headers: Record<string, string>;
  createdAt: number;
};

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** In-memory backend, used under test (and as the fallback if the DB errors). */
let memoryBackend: Map<string, IdempotencyRecord> | null = null;

function getMemoryBackend(): Map<string, IdempotencyRecord> {
  if (!memoryBackend) {
    memoryBackend = new Map();
  }
  return memoryBackend;
}

function usesMemoryBackend(): boolean {
  return memoryBackend !== null || process.env.VITEST === "true";
}

function normalizeKey(raw: string | null): string | null {
  const key = raw?.trim();
  if (!key || key.length > 256) {
    return null;
  }
  return key;
}

export function readIdempotencyKey(request: Request): string | null {
  return normalizeKey(request.headers.get("Idempotency-Key"));
}

function replayResponse(record: IdempotencyRecord): Response {
  const headers = new Headers(record.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Idempotency-Replayed", "true");
  return new Response(record.body, { status: record.status, headers });
}

export async function getIdempotentResponse(
  scope: string,
  key: string,
): Promise<Response | null> {
  if (usesMemoryBackend()) {
    const record = getMemoryBackend().get(`${scope}:${key}`);
    if (!record) return null;
    // Pending reservation (status 0) — a concurrent request is mid-flight; not
    // a completed response to replay.
    if (record.status === 0) return null;
    if (record.createdAt + DEFAULT_TTL_MS < Date.now()) {
      getMemoryBackend().delete(`${scope}:${key}`);
      return null;
    }
    return replayResponse(record);
  }

  try {
    const rows = await db
      .select()
      .from(idempotency_record)
      .where(
        and(eq(idempotency_record.scope, scope), eq(idempotency_record.key, key)),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    // Pending reservation (status 0) — a concurrent request is mid-flight.
    if (row.status === 0) return null;

    const createdAt = new Date(row.created_at).getTime();
    if (createdAt + DEFAULT_TTL_MS < Date.now()) {
      return null;
    }
    return replayResponse({
      status: row.status,
      body: row.body,
      headers: (row.headers ?? {}) as Record<string, string>,
      createdAt,
    });
  } catch (error) {
    // Fail open: a lookup failure must not block the request. The worst case is
    // the handler runs again, which is what happened on every replay before
    // this store was durable.
    logger.error("idempotency.lookup_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Reserve an idempotency key before running the handler. Returns true when THIS
 * request claimed the key (must run the handler), false when another request
 * already holds it (in-flight or completed — caller must replay or 409).
 *
 * Without this, two concurrent requests carrying the same Idempotency-Key both
 * read no cached response and both execute the side-effecting handler (e.g. two
 * Stripe checkout sessions). The DB primary key on (scope, key) makes the
 * reservation insert atomic.
 */
async function reserveIdempotencyKey(scope: string, key: string): Promise<boolean> {
  if (usesMemoryBackend()) {
    const mapKey = `${scope}:${key}`;
    const map = getMemoryBackend();
    if (map.has(mapKey)) return false;
    map.set(mapKey, { status: 0, body: "", headers: {}, createdAt: Date.now() });
    return true;
  }

  try {
    const rows = await db
      .insert(idempotency_record)
      .values({
        scope,
        key,
        status: 0,
        body: "",
        headers: {},
        created_at: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning({ key: idempotency_record.key });
    return rows.length > 0;
  } catch (error) {
    // Fail open: if the reservation write fails, don't block the request — run
    // the handler, matching the pre-reservation behavior.
    logger.error("idempotency.reserve_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/** Release a still-pending reservation so a later retry can proceed. Never
 * deletes a completed response (status <> 0). */
async function releaseIdempotencyReservation(scope: string, key: string): Promise<void> {
  if (usesMemoryBackend()) {
    const mapKey = `${scope}:${key}`;
    const record = getMemoryBackend().get(mapKey);
    if (record && record.status === 0) {
      getMemoryBackend().delete(mapKey);
    }
    return;
  }

  try {
    await db
      .delete(idempotency_record)
      .where(
        and(
          eq(idempotency_record.scope, scope),
          eq(idempotency_record.key, key),
          eq(idempotency_record.status, 0),
        ),
      );
  } catch (error) {
    logger.error("idempotency.release_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function storeIdempotentResponse(
  scope: string,
  key: string,
  response: Response,
  body: unknown,
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const serializedBody = JSON.stringify(body);

  if (usesMemoryBackend()) {
    getMemoryBackend().set(`${scope}:${key}`, {
      status: response.status,
      body: serializedBody,
      headers,
      createdAt: Date.now(),
    });
    return;
  }

  try {
    await db
      .insert(idempotency_record)
      .values({
        scope,
        key,
        status: response.status,
        body: serializedBody,
        headers,
        created_at: new Date().toISOString(),
      })
      // Complete the reservation this request inserted (status 0 → real
      // response). Only the reserving request reaches here — a concurrent
      // duplicate loses the reservation and 409s — so overwriting is safe.
      .onConflictDoUpdate({
        target: [idempotency_record.scope, idempotency_record.key],
        set: {
          status: response.status,
          body: serializedBody,
          headers,
          created_at: new Date().toISOString(),
        },
      });
  } catch (error) {
    logger.error("idempotency.store_failed", {
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function withIdempotency(
  request: Request,
  scope: string,
  handler: () => Promise<{ response: Response; body: unknown }>,
): Promise<Response> {
  const key = readIdempotencyKey(request);
  if (!key) {
    const result = await handler();
    return result.response;
  }

  const cached = await getIdempotentResponse(scope, key);
  if (cached) {
    return cached;
  }

  // Reserve the key before running the side-effecting handler so a concurrent
  // duplicate can't also execute it.
  const reserved = await reserveIdempotencyKey(scope, key);
  if (!reserved) {
    // Another request holds this key. It may have completed between our lookup
    // and reserve; otherwise it is in-flight and the client should retry.
    const completed = await getIdempotentResponse(scope, key);
    if (completed) {
      return completed;
    }
    return new Response(
      JSON.stringify({
        error: "A request with this Idempotency-Key is already in progress.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  let result: { response: Response; body: unknown };
  try {
    result = await handler();
  } catch (error) {
    // Free the reservation so the failed request can be retried.
    await releaseIdempotencyReservation(scope, key);
    throw error;
  }

  if (result.response.status >= 200 && result.response.status < 300) {
    await storeIdempotentResponse(scope, key, result.response, result.body);
  } else {
    // Non-success responses are not cached; release the reservation so a retry
    // can run the handler again (matches the pre-reservation behavior).
    await releaseIdempotencyReservation(scope, key);
  }
  return result.response;
}

/** Prune expired records. Called from the worker's maintenance sweep. */
export async function pruneExpiredIdempotencyRecords(): Promise<number> {
  const cutoff = new Date(Date.now() - DEFAULT_TTL_MS).toISOString();
  const rows = await db
    .delete(idempotency_record)
    .where(lt(idempotency_record.created_at, cutoff))
    .returning({ key: idempotency_record.key });
  return rows.length;
}

/** Test helper — clears the in-memory store between tests. */
export function resetIdempotencyForTests(): void {
  getMemoryBackend().clear();
}
