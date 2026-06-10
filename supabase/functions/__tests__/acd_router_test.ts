import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  buildAgentBridgeTwiml,
  buildHoldMusicTwiml,
  makeQueueName,
  parseQueueIdFromName,
} from "../_shared/acd-utils.ts";

Deno.test("makeQueueName and parseQueueIdFromName round-trip", () => {
  const id = 42;
  const name = makeQueueName(id);
  assertEquals(name, "inbound_q_42");
  assertEquals(parseQueueIdFromName(name), 42);
  assertEquals(parseQueueIdFromName("inbound_q_abc"), null);
  assertEquals(parseQueueIdFromName("inbound_q_"), null);
  assertEquals(parseQueueIdFromName("other_q_42"), null);
});

Deno.test("buildHoldMusicTwiml returns default message when no hold audio", () => {
  const twiml = buildHoldMusicTwiml({ holdAudio: null, queueName: "inbound_q_1" });
  assertEquals(twiml.includes("You are now in the queue"), true);
  assertEquals(twiml.includes("<?xml"), true);
  assertEquals(twiml.includes("<Response>"), true);
  assertEquals(twiml.includes("</Response>"), true);
});

Deno.test("buildHoldMusicTwiml returns Play element when hold audio provided", () => {
  const twiml = buildHoldMusicTwiml({
    holdAudio: "https://example.com/hold.mp3",
    queueName: "inbound_q_1",
  });
  assertEquals(twiml.includes("<Play>"), true);
  assertEquals(twiml.includes("https://example.com/hold.mp3"), true);
  assertEquals(twiml.includes("<Say>"), false);
});

Deno.test("buildAgentBridgeTwiml returns Dequeue TwiML", () => {
  const twiml = buildAgentBridgeTwiml("inbound_q_42");
  assertEquals(twiml.includes("<Queue>inbound_q_42</Queue>"), true);
  assertEquals(twiml.includes("<Dial>"), true);
  assertEquals(twiml.includes("<?xml"), true);
});

Deno.test("buildAgentBridgeTwiml escapes XML special chars in queue name", () => {
  const twiml = buildAgentBridgeTwiml("inbound_q_1&2");
  assertEquals(twiml.includes("<Queue>inbound_q_1&amp;2</Queue>"), true);
});
