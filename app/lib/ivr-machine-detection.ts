type VoicemailPolicy = {
  voicemail_drop_enabled?: boolean | null;
  voicemail_file?: string | null;
};

/** Enable reports machine_start during the greeting; a drop must wait for its end.
 * https://www.twilio.com/docs/voice/answering-machine-detection
 */
export function ivrMachineDetection(campaign: VoicemailPolicy | null | undefined):
  "Enable" | "DetectMessageEnd" {
  return campaign?.voicemail_drop_enabled && campaign.voicemail_file
    ? "DetectMessageEnd"
    : "Enable";
}

/** Twilio's machine_end_other is a machine result, not fax or unknown. */
export function isMachineAnswered(
  answeredBy: string | null | undefined,
  callStatus?: string | null,
): boolean {
  return callStatus !== "completed" && (
    answeredBy === "machine_start" ||
    answeredBy === "machine_end_beep" ||
    answeredBy === "machine_end_silence" ||
    answeredBy === "machine_end_other"
  );
}
