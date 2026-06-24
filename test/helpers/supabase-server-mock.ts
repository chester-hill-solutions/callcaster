import { vi } from "vitest";

/** Minimal createSupabaseServerClient stub for route tests after dual-auth migration. */
export function stubCreateSupabaseServerClient(
  supabaseClient: unknown = {},
  headers: Headers = new Headers(),
) {
  return vi.fn(() => ({
    supabaseClient,
    headers,
  }));
}

export const defaultCreateSupabaseServerClient = stubCreateSupabaseServerClient();
