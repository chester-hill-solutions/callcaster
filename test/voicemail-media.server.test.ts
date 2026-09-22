import { describe, expect, test } from "vitest";
import {
  isLegacyVoicemailObjectName,
  voicemailListPrefix,
  voicemailObjectPath,
  VOICEMAIL_OBJECT_PREFIX,
} from "../app/lib/voicemail-media.server";

describe("voicemail-media.server", () => {
  test("keeps voicemail objects under a top-level prefix, never the library prefix", () => {
    const ws = "c519a538-de2b-4957-84fb-f1fd9171e01d";
    expect(voicemailObjectPath(ws, "voicemail-+15550001111-2026-09-22T10:00:00.000Z.mp3")).toBe(
      `voicemail/${ws}/voicemail-+15550001111-2026-09-22T10:00:00.000Z.mp3`,
    );
    // A library list (prefix `ws`) and a voicemails list are disjoint by construction.
    expect(voicemailListPrefix(ws)).toBe(`voicemail/${ws}`);
    expect(voicemailListPrefix(ws)).not.toBe(ws);
  });

  test("recognizes the legacy voicemail naming for migration", () => {
    expect(VOICEMAIL_OBJECT_PREFIX).toBe("voicemail");
    expect(isLegacyVoicemailObjectName("voicemail-+1555-2026-09-22T00:00:00.000Z.mp3")).toBe(true);
    expect(isLegacyVoicemailObjectName("voicemail-undefined-x.mp3")).toBe(true);
    expect(isLegacyVoicemailObjectName("greeting.mp3")).toBe(false);
    expect(isLegacyVoicemailObjectName("recording-CA1.mp3")).toBe(false);
  });
});