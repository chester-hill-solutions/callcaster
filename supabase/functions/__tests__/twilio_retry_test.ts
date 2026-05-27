import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  isRetryableSmsTwilioError,
  isRetryableVoiceTwilioError,
} from "../_shared/twilio-retry.ts";

Deno.test("isRetryableSmsTwilioError covers throughput and transient failures", () => {
  assertEquals(isRetryableSmsTwilioError({ status: 429 }), true);
  assertEquals(isRetryableSmsTwilioError({ code: 30022 }), true);
  assertEquals(isRetryableSmsTwilioError({ code: 30001 }), true);
  assertEquals(isRetryableSmsTwilioError({ status: 503 }), true);
  assertEquals(isRetryableSmsTwilioError({ code: 21211 }), false);
});

Deno.test("isRetryableVoiceTwilioError covers CPS and concurrency failures", () => {
  assertEquals(isRetryableVoiceTwilioError({ code: 31206 }), true);
  assertEquals(isRetryableVoiceTwilioError({ code: 10004 }), true);
  assertEquals(isRetryableVoiceTwilioError({ status: 503 }), true);
  assertEquals(isRetryableVoiceTwilioError({ code: 21217 }), false);
});
