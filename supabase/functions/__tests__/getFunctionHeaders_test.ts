import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getFunctionHeaders } from "../_shared/getFunctionHeaders.ts";

Deno.test("getFunctionHeaders throws when EDGE_FUNCTION_JWT missing", () => {
  Deno.env.delete("EDGE_FUNCTION_JWT");
  assertThrows(
    () => getFunctionHeaders(),
    Error,
    "EDGE_FUNCTION_JWT is not set",
  );
});

Deno.test("getFunctionHeaders throws when EDGE_FUNCTION_JWT not JWT-shaped", () => {
  Deno.env.set("EDGE_FUNCTION_JWT", "not-a-jwt");
  assertThrows(
    () => getFunctionHeaders(),
    Error,
    "EDGE_FUNCTION_JWT must be the legacy JWT service-role key",
  );
});

Deno.test("getFunctionHeaders returns expected headers for JWT-shaped key", () => {
  Deno.env.set("EDGE_FUNCTION_JWT", "a.b.c");
  assertEquals(getFunctionHeaders(), {
    Authorization: "Bearer a.b.c",
    "Content-Type": "application/json",
    apikey: "a.b.c",
  });
});

