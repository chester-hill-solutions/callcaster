type ScriptLike = { steps?: unknown } | null | undefined;

type CampaignLike =
  | {
      script?: ScriptLike | ScriptLike[];
    }
  | null
  | undefined;

/** Resolve IVR script steps from unified `campaign.script` (post–Phase 1.17). */
export function scriptStepsFromCampaign(campaign: CampaignLike): unknown {
  if (!campaign?.script) return null;
  const script = campaign.script;
  if (Array.isArray(script)) {
    return script[0]?.steps ?? null;
  }
  return script.steps ?? null;
}
