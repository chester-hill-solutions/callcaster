import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  jsonHandlerResponse,
  parseHandlerOutcome,
} from "../_shared/handler-response.ts";

Deno.test("parseHandlerOutcome reads structured handler responses", async () => {
  const retryable = jsonHandlerResponse("retryable_failure", {
    error: "rate limited",
  });
  assertEquals(
    parseHandlerOutcome(retryable, await retryable.text()),
    "retryable_failure",
  );

  const success = jsonHandlerResponse("success");
  assertEquals(
    parseHandlerOutcome(success, await success.text()),
    "success",
  );
});

Deno.test("parseHandlerOutcome falls back to HTTP status", () => {
  assertEquals(
    parseHandlerOutcome(new Response("oops", { status: 503 }), "oops"),
    "retryable_failure",
  );
  assertEquals(
    parseHandlerOutcome(new Response("bad", { status: 422 }), "bad"),
    "permanent_failure",
  );
});
