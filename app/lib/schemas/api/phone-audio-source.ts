import { z } from "zod";

export const phoneAudioSourceFields = {
  audio_connection_id: z.string().uuid().transform(value => value.toLowerCase()).optional(),
  audio_generation: z.union([z.number(), z.string().regex(/^[1-9][0-9]*$/)]).transform(Number).pipe(z.number().int().positive().safe()).optional(),
};

export function requirePhoneAudioSource(input: {
  audio_connection_id?: string; audio_generation?: number; selected_device?: string; dial_intent_id?: string;
}, context: z.RefinementCtx) {
  if (input.audio_connection_id === undefined && input.audio_generation === undefined) return;
  if (!input.audio_connection_id || input.audio_generation === undefined || !input.dial_intent_id ||
    !input.selected_device || input.selected_device === "computer")
    context.addIssue({ code: "custom", message: "Confirmed phone Start requires its connection, generation, phone and dial intent." });
}
