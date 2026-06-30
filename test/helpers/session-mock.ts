import { vi } from "vitest";

/** Session reader stub for route tests after Postgres auth migration. */
export function stubSessionReader(
  session: {
    user?: { id: string; email?: string } | null;
    headers?: Headers;
  } = {},
) {
  return vi.fn(async () => ({
    user: session.user ?? null,
    headers: session.headers ?? new Headers(),
  }));
}

export const defaultSessionReader = stubSessionReader();
