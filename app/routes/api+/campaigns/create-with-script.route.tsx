export { action } from "./create-with-script.action.server";

const SCRIPT_TYPES_FOR_CAMPAIGN: Record<CampaignType, string> = {
  live_call: "script",
  message: "script",
  robocall: "ivr",
  simple_ivr: "ivr",
  complex_ivr: "ivr",
};

const SCRIPT_CAMPAIGN_TYPES: CampaignType[] = [
  "live_call",
  "robocall",
  "simple_ivr",
  "complex_ivr",
];

interface CreateWithScriptBody {
  workspace_id?: string;
  title: string;
  type: CampaignType;
  caller_id: string;
  script?: {
    name: string;
    type?: string;
    steps: Record<string, unknown>;
  };
  script_id?: number;
  audience_ids?: number[];
  status?: string;
  enqueue_audience_contacts?: boolean;
  is_active?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  schedule?: unknown;
}

function jsonResponse(
  data: unknown,
  status: number
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

