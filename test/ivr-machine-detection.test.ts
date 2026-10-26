import { expect, test } from "vitest";
import { isMachineAnswered, ivrMachineDetection } from "../app/lib/ivr-machine-detection";

test.each([
  { voicemail_drop_enabled: false, voicemail_file: "drop.mp3" },
  { voicemail_drop_enabled: true, voicemail_file: null },
  null,
])("machine hangups keep early detection when there is no playable drop: %j", campaign => {
  expect(ivrMachineDetection(campaign)).toBe("Enable");
});

test.each(["machine_start", "machine_end_beep", "machine_end_silence", "machine_end_other"])(
  "%s is a machine answer, but a completed call cannot trigger another drop", result => {
    expect(isMachineAnswered(result, "in-progress")).toBe(true);
    expect(isMachineAnswered(result, "completed")).toBe(false);
  },
);

test.each(["human", "fax", "unknown", "other", "machine_other", "not_a_machine", "", null])(
  "%s is not a documented machine answer", result => {
    expect(isMachineAnswered(result)).toBe(false);
  },
);
