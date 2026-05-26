import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getFunctionUrl,
  getFunctionsBaseUrl,
} from "../_shared/getFunctionsBaseUrl.ts";

Deno.test("getFunctionsBaseUrl throws when SUPABASE_URL missing", () => {
  Deno.env.delete("SUPABASE_URL");
  assertThrows(
    () => getFunctionsBaseUrl(),
    Error,
    "SUPABASE_URL is not set",
  );
});

Deno.test("getFunctionsBaseUrl strips trailing slash", () => {
  Deno.env.set("SUPABASE_URL", "https://project.supabase.co/");
  assertEquals(
    getFunctionsBaseUrl(),
    "https://project.supabase.co/functions/v1",
  );
});

Deno.test("getFunctionUrl appends function name", () => {
  Deno.env.set("SUPABASE_URL", "https://project.supabase.co");
  assertEquals(
    getFunctionUrl("queue-next"),
    "https://project.supabase.co/functions/v1/queue-next",
  );
});
