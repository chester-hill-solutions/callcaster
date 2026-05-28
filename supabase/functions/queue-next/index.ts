import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import {
  claimCampaignQueueContacts,
  countActiveIvrCampaignCalls,
  loadWorkspaceThroughputConfig,
  markCampaignCompleteIfDrained,
  resetStaleClaims,
  resolveClaimLimit,
  resolveDispatchMode,
  resolveIvrClaimLimit,
  scheduleNextDispatch,
  type ClaimedContact,
} from "../_shared/campaign-dispatch.ts";
import { parseHandlerOutcome } from "../_shared/handler-response.ts";
import { getFunctionUrl } from "../_shared/getFunctionsBaseUrl.ts";
import { getFunctionHeaders } from "../_shared/getFunctionHeaders.ts";
import {
  DISPATCH_TICK_MS,
  LEGACY_QUEUE_DELAY_MS,
} from "../_shared/queue-policy.ts";

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
}): Promise<{ response: Response; outcome: ReturnType<typeof parseHandlerOutcome> extends infer T ? T : never; errorText: string }> {
  const headers = getFunctionHeaders();
  const bodyBase = {
    campaign_id: args.campaignId,
    workspace_id: args.contact.workspace,
    contact_id: args.contact.contact_id,
    caller_id: args.contact.caller_id || args.campaign.caller_id,
    queue_id: args.contact.id,
    user_id: args.owner,
    owner: args.owner,
  };

  let response: Response;
  if (args.campaign.type === "robocall") {
    response = await fetch(getFunctionUrl("ivr-handler"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...bodyBase,
        to_number: args.contact.phone,
        type: args.campaign.type,
      }),
    });
  } else if (args.campaign.type === "message") {
    response = await fetch(getFunctionUrl("sms-handler"), {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...bodyBase,
        to_number: args.contact.phone,
        sms_send_mode: args.campaign.sms_send_mode,
        sms_messaging_service_sid: args.campaign.sms_messaging_service_sid,
      }),
    });
  } else {
    throw new Error(`Unknown campaign type: ${args.campaign.type}`);
  }

  const errorText = await response.text();
  const outcome = parseHandlerOutcome(response, errorText);
  return { response, outcome, errorText };
}

async function dispatchContacts(args: {
  supabase: ReturnType<typeof createClient>;
  campaign: CampaignRow;
  campaignId: number;
  owner: string | null;
  contacts: ClaimedContact[];
  legacyDelayMs?: number;
}): Promise<{ attempted: number; failed: number }> {
  if (args.legacyDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, args.legacyDelayMs));
  }

  const results = await Promise.allSettled(
    args.contacts.map(async (contact) => {
      const { outcome, errorText } = await invokeHandler({
        campaign: args.campaign,
        contact,
        campaignId: args.campaignId,
        owner: args.owner,
      });

      if (outcome === "retryable_failure" || outcome === "permanent_failure") {
        throw new Error(errorText.slice(0, 500) || outcome);
      }
    }),
  );

  const failed = results.filter((result) => result.status === "rejected").length;
  return { attempted: args.contacts.length, failed };
}

async function finishDispatchTick(args: {
  supabase: ReturnType<typeof createClient>;
  campaignId: number;
  owner: string | null;
}): Promise<boolean> {
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

  return completed;
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

    let claimLimit = 1;
    let maxInflight: number | null = null;

    if (dispatchMode === "parallel") {
      if (campaign.type === "robocall") {
        const activeCalls = await countActiveIvrCampaignCalls(
          supabase,
          Number(campaign_id),
        );
        claimLimit = resolveIvrClaimLimit({
          config: throughputConfig,
          activeCalls,
        });
        if (claimLimit <= 0) {
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
        maxInflight = claimLimit;
      } else {
        claimLimit = resolveClaimLimit({
          campaignType: campaign.type,
          config: throughputConfig,
        });
      }
    }

    const contacts = await claimCampaignQueueContacts({
      supabase,
      campaignId: Number(campaign_id),
      owner: owner || null,
      claimLimit,
      maxInflight,
    });

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

    const batch = await dispatchContacts({
      supabase,
      campaign,
      campaignId: Number(campaign_id),
      owner: owner || null,
      contacts,
      legacyDelayMs: dispatchMode === "legacy" ? LEGACY_QUEUE_DELAY_MS : undefined,
    });

    const completed = await finishDispatchTick({
      supabase,
      campaignId: Number(campaign_id),
      owner: owner || null,
    });

    if (dispatchMode === "legacy") {
      return new Response(JSON.stringify([contacts[0]]), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        status: completed ? "campaign_completed" : "batch_dispatched",
        attempted: batch.attempted,
        failed: batch.failed,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
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
