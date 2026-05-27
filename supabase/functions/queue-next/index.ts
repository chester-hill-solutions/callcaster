import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import {
  completeQueueContact,
  countActiveIvrCampaignCalls,
  loadWorkspaceThroughputConfig,
  markCampaignCompleteIfDrained,
  requeueContact,
  resetStaleClaims,
  resolveClaimLimit,
  resolveDispatchMode,
  scheduleNextDispatch,
  type ClaimedContact,
} from "../_shared/campaign-dispatch.ts";
import { getFunctionUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { getFunctionHeaders } from "../_shared/getFunctionHeaders.ts";
import { DISPATCH_TICK_MS } from "../_shared/throughput-config.ts";

const LEGACY_QUEUE_DELAY_MS = 200;

type CampaignRow = {
  is_active: boolean;
  group_household_queue: boolean;
  type: string;
  sms_send_mode: string | null;
  sms_messaging_service_sid: string | null;
  caller_id: string | null;
};

async function invokeHandler(args: {
  campaign: CampaignRow;
  contact: ClaimedContact;
  campaignId: number;
  owner: string | null;
  dispatchMode: "legacy" | "parallel";
}): Promise<Response> {
  const headers = getFunctionHeaders();
  const bodyBase = {
    campaign_id: args.campaignId,
    workspace_id: args.contact.workspace,
    contact_id: args.contact.contact_id,
    caller_id: args.contact.caller_id || args.campaign.caller_id,
    queue_id: args.contact.id,
    user_id: args.owner,
    owner: args.owner,
    dispatch_mode: args.dispatchMode,
  };

  if (args.campaign.type === "robocall") {
    return fetch(getFunctionUrl("ivr-handler"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...bodyBase,
        to_number: args.contact.phone,
        type: args.campaign.type,
      }),
    });
  }

  if (args.campaign.type === "message") {
    return fetch(getFunctionUrl("sms-handler"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...bodyBase,
        to_number: args.contact.phone,
        sms_send_mode: args.campaign.sms_send_mode,
        sms_messaging_service_sid: args.campaign.sms_messaging_service_sid,
      }),
    });
  }

  throw new Error(`Unknown campaign type: ${args.campaign.type}`);
}

async function handleLegacyDispatch(args: {
  supabase: ReturnType<typeof createClient>;
  campaign: CampaignRow;
  campaignId: number;
  owner: string | null;
  contact: ClaimedContact;
}): Promise<Response> {
  await new Promise((resolve) => setTimeout(resolve, LEGACY_QUEUE_DELAY_MS));

  const response = await invokeHandler({
    campaign: args.campaign,
    contact: args.contact,
    campaignId: args.campaignId,
    owner: args.owner,
    dispatchMode: "legacy",
  });

  if (!response.ok) {
    await args.supabase.rpc("handle_campaign_queue_entry", {
      p_contact_id: args.contact.contact_id,
      p_campaign_id: Number(args.campaignId),
      p_requeue: true,
    });
    throw new Error(`handler failed with status ${response.status}`);
  }

  return new Response(JSON.stringify([args.contact]), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleParallelDispatch(args: {
  supabase: ReturnType<typeof createClient>;
  campaign: CampaignRow;
  campaignId: number;
  owner: string | null;
  contacts: ClaimedContact[];
}): Promise<Response> {
  const results = await Promise.allSettled(
    args.contacts.map(async (contact) => {
      const response = await invokeHandler({
        campaign: args.campaign,
        contact,
        campaignId: args.campaignId,
        owner: args.owner,
        dispatchMode: "parallel",
      });

      if (!response.ok) {
        const errorText = await response.text();
        await requeueContact({
          supabase: args.supabase,
          queueId: contact.id,
          errorText: errorText.slice(0, 500),
        });
        throw new Error(errorText);
      }
    }),
  );

  const failed = results.filter((result) => result.status === "rejected").length;
  console.log("Parallel dispatch batch complete", {
    campaignId: args.campaignId,
    attempted: args.contacts.length,
    failed,
  });

  const completed = await markCampaignCompleteIfDrained({
    supabase: args.supabase,
    campaignId: args.campaignId,
  });

  if (!completed) {
    await scheduleNextDispatch({
      fetchImpl: fetch,
      queueNextUrl: getFunctionUrl("queue-next"),
      headers: getFunctionHeaders(),
      campaignId: args.campaignId,
      owner: args.owner,
      delayMs: DISPATCH_TICK_MS,
    });
  }

  return new Response(
    JSON.stringify({
      status: completed ? "campaign_completed" : "batch_dispatched",
      attempted: args.contacts.length,
      failed,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const { campaign_id, owner } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: campaign, error: campaignError } = await supabase
      .from("campaign")
      .select(
        "is_active, group_household_queue, type, sms_send_mode, sms_messaging_service_sid, caller_id, workspace",
      )
      .eq("id", campaign_id)
      .single();

    if (campaignError) throw campaignError;

    if (!campaign.is_active) {
      return new Response(JSON.stringify({ status: "campaign_completed" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    await resetStaleClaims(supabase, Number(campaign_id));

    const throughputConfig = await loadWorkspaceThroughputConfig(
      supabase,
      campaign.workspace,
    );
    const dispatchMode = resolveDispatchMode(throughputConfig);

    if (
      dispatchMode === "parallel" &&
      campaign.type === "robocall"
    ) {
      const activeCalls = await countActiveIvrCampaignCalls(
        supabase,
        Number(campaign_id),
      );
      if (activeCalls >= throughputConfig.voiceConcurrentCallLimit) {
        console.warn("IVR concurrency limit reached; deferring dispatch", {
          campaignId: campaign_id,
          activeCalls,
          limit: throughputConfig.voiceConcurrentCallLimit,
        });
        await scheduleNextDispatch({
          fetchImpl: fetch,
          queueNextUrl: getFunctionUrl("queue-next"),
          headers: getFunctionHeaders(),
          campaignId: Number(campaign_id),
          owner: owner || null,
          delayMs: DISPATCH_TICK_MS,
        });
        return new Response(
          JSON.stringify({
            status: "concurrency_deferred",
            activeCalls,
            limit: throughputConfig.voiceConcurrentCallLimit,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const claimLimit =
      dispatchMode === "parallel"
        ? resolveClaimLimit({
          campaignType: campaign.type,
          config: throughputConfig,
        })
        : 1;

    const { data: claimed, error: claimError } = await supabase.rpc(
      "claim_campaign_queue_contacts",
      {
        campaign_id_pro: campaign_id,
        claimed_by_user_id: owner || null,
        claim_limit: claimLimit,
      },
    );
    if (claimError) throw claimError;

    const contacts = (claimed ?? []) as ClaimedContact[];
    if (!contacts.length) {
      const completed = await markCampaignCompleteIfDrained({
        supabase,
        campaignId: Number(campaign_id),
      });
      return new Response(
        JSON.stringify({ status: completed ? "queue_empty" : "awaiting_inflight" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (dispatchMode === "parallel") {
      return handleParallelDispatch({
        supabase,
        campaign,
        campaignId: Number(campaign_id),
        owner: owner || null,
        contacts,
      });
    }

    return handleLegacyDispatch({
      supabase,
      campaign,
      campaignId: Number(campaign_id),
      owner: owner || null,
      contact: contacts[0],
    });
  } catch (error) {
    console.error("queue-next error", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
