import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";

type WorkspaceTwilioSyncSnapshot = {
  accountStatus: string | null;
  accountFriendlyName: string | null;
  phoneNumberCount: number;
  numberTypes: string[];
  recentUsageCount: number;
  usageTotalPrice: number | null;
  lastSyncedAt: string | null;
  lastSyncStatus: "never_synced" | "syncing" | "healthy" | "error";
  lastSyncError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function normalizeTwilioData(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function buildErrorSnapshot(message: string): WorkspaceTwilioSyncSnapshot {
  return {
    accountStatus: null,
    accountFriendlyName: null,
    phoneNumberCount: 0,
    numberTypes: [],
    recentUsageCount: 0,
    usageTotalPrice: null,
    lastSyncedAt: new Date().toISOString(),
    lastSyncStatus: "error",
    lastSyncError: message,
  };
}

async function syncWorkspace(workspace: {
  id: string;
  name: string;
  twilio_data: unknown;
}, supabase: ReturnType<typeof createSupabase>) {
  const twilioData = normalizeTwilioData(workspace.twilio_data);
  const sid = typeof twilioData.sid === "string" ? twilioData.sid : null;
  const authToken = typeof twilioData.authToken === "string" ? twilioData.authToken : null;

  if (!sid || !authToken) {
    const snapshot = buildErrorSnapshot("Missing workspace Twilio credentials");
    await supabase
      .from("workspace")
      .update({
        twilio_data: {
          ...twilioData,
          portalSync: snapshot,
        },
      })
      .eq("id", workspace.id);

    return {
      workspaceId: workspace.id,
      status: "error",
      message: snapshot.lastSyncError,
    };
  }

  try {
    const client = new Twilio(sid, authToken);
    const [account, numbers, usageRecords] = await Promise.all([
      client.api.v2010.accounts(sid).fetch(),
      client.incomingPhoneNumbers.list({ limit: 200 }),
      client.usage.records.list({ limit: 20 }),
    ]);

    const numberTypes = Array.from(
      new Set(
        numbers
          .map((number) => number.capabilities)
          .flatMap((capabilities) => {
            const detectedTypes: string[] = [];
            if (capabilities.sms) detectedTypes.push("sms");
            if (capabilities.mms) detectedTypes.push("mms");
            if (capabilities.voice) detectedTypes.push("voice");
            return detectedTypes;
          }),
      ),
    );

    const usageTotalPrice = usageRecords.reduce((sum, record) => {
      const price = Number(record.price ?? 0);
      return Number.isFinite(price) ? sum + price : sum;
    }, 0);

    const snapshot: WorkspaceTwilioSyncSnapshot = {
      accountStatus: account.status,
      accountFriendlyName: account.friendlyName,
      phoneNumberCount: numbers.length,
      numberTypes,
      recentUsageCount: usageRecords.length,
      usageTotalPrice,
      lastSyncedAt: new Date().toISOString(),
      lastSyncStatus: "healthy",
      lastSyncError: null,
    };

    const { error } = await supabase
      .from("workspace")
      .update({
        twilio_data: {
          ...twilioData,
          portalSync: snapshot,
        },
      })
      .eq("id", workspace.id);

    if (error) {
      throw error;
    }

    return {
      workspaceId: workspace.id,
      status: "healthy",
      message: null,
    };
  } catch (error) {
    const snapshot = buildErrorSnapshot(
      error instanceof Error ? error.message : "Unknown Twilio sync failure",
    );

    await supabase
      .from("workspace")
      .update({
        twilio_data: {
          ...twilioData,
          portalSync: snapshot,
        },
      })
      .eq("id", workspace.id);

    return {
      workspaceId: workspace.id,
      status: "error",
      message: snapshot.lastSyncError,
    };
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  try {
    const supabase = createSupabase();
    const body = await req.json().catch(() => ({}));
    const workspaceId =
      isRecord(body) && typeof body.workspaceId === "string" ? body.workspaceId : null;

    const query = supabase
      .from("workspace")
      .select("id, name, twilio_data")
      .order("created_at", { ascending: false });

    const { data: workspaces, error } = workspaceId
      ? await query.eq("id", workspaceId)
      : await query;

    if (error) {
      throw error;
    }

    const results = [];
    for (const workspace of workspaces ?? []) {
      results.push(await syncWorkspace(workspace, supabase));
    }

    return new Response(
      JSON.stringify({
        success: true,
        count: results.length,
        results,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
