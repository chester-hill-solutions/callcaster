import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@^2.39.6";
import Twilio from "npm:twilio@^5.3.0";
import {
  NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE,
  RENTED_NUMBER_MONTHLY_CREDITS,
  type NotificationWindowKey,
  formatCycleKey,
  formatDateIsoUtc,
  getRelevantDueDates,
  isAtOrAfterRolloutStart,
  resolveNotificationWindow,
  utcDayStart,
} from "../_shared/number-rental-billing.ts";

type JsonObject = Record<string, unknown>;

type RentalBillingState = {
  notifications: Record<string, string>;
};

type WorkspaceNumberRow = {
  id: number;
  workspace: string;
  phone_number: string | null;
  friendly_name: string | null;
  created_at: string;
  capabilities: unknown;
  type: string;
};

type WorkspaceRow = {
  id: string;
  name: string | null;
  credits: number | null;
  twilio_data: unknown;
};

function createSupabase() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function asRecord(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readRentalBillingState(capabilities: unknown): RentalBillingState {
  const caps = asRecord(capabilities);
  const rentalBilling = asRecord(caps.rental_billing);
  const notificationsRaw = asRecord(rentalBilling.notifications);
  const notifications: Record<string, string> = {};
  for (const [key, value] of Object.entries(notificationsRaw)) {
    if (typeof value === "string") {
      notifications[key] = value;
    }
  }
  return { notifications };
}

function writeRentalBillingState(
  capabilities: unknown,
  state: RentalBillingState,
): JsonObject {
  const caps = asRecord(capabilities);
  const rentalBilling = asRecord(caps.rental_billing);
  return {
    ...caps,
    rental_billing: {
      ...rentalBilling,
      notifications: state.notifications,
      updated_at: new Date().toISOString(),
    },
  };
}

function noticeKey(args: { cycleKey: string; windowKey: NotificationWindowKey }) {
  return `${args.cycleKey}:${args.windowKey}`;
}

function chargeIdempotencyKey(numberId: number, cycleKey: string) {
  return `number_rent:${numberId}:${cycleKey}`;
}

function buildReminderSubject(args: {
  windowKey: NotificationWindowKey;
  workspaceName: string;
  phoneNumber: string;
}) {
  if (args.windowKey === "post30") {
    return `Final notice: ${args.phoneNumber} has been released`;
  }
  return `Reminder: ${args.phoneNumber} renews soon`;
}

function buildReminderHtml(args: {
  workspaceName: string;
  phoneNumber: string;
  dueDate: string;
  windowKey: NotificationWindowKey;
}) {
  const dueCopy =
    args.windowKey === "post30"
      ? `This number passed its renewal date (${args.dueDate}) and has now been released after a 30 day grace period.`
      : `This number renews on ${args.dueDate} at ${RENTED_NUMBER_MONTHLY_CREDITS} credits per month.`;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2>Phone Number Billing Notice</h2>
      <p>Workspace: <strong>${args.workspaceName}</strong></p>
      <p>Number: <strong>${args.phoneNumber}</strong></p>
      <p>${dueCopy}</p>
      <p>You can cancel this number from workspace settings.</p>
    </div>
  `;
}

async function sendEmail(args: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}) {
  if (args.to.length === 0) {
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Callcaster <info@callcaster.ca>",
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}

async function getWorkspaceContacts(
  supabase: SupabaseClient,
  workspaceId: string,
) {
  const { data, error } = await supabase.rpc("get_workspace_users", {
    selected_workspace_id: workspaceId,
  });
  if (error) throw error;
  const recipients = (data ?? [])
    .filter((row: Record<string, unknown>) => {
      const role = row.user_workspace_role;
      return role === "owner" || role === "admin";
    })
    .map((row: Record<string, unknown>) => row.username)
    .filter((email: unknown): email is string => typeof email === "string");
  return Array.from(new Set(recipients));
}

async function hasChargeForCycle(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  numberId: number;
  cycleKey: string;
}): Promise<boolean> {
  const { data, error } = await args.supabase
    .from("transaction_history")
    .select("id")
    .eq("workspace", args.workspaceId)
    .eq("type", "DEBIT")
    .eq("idempotency_key", chargeIdempotencyKey(args.numberId, args.cycleKey))
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function insertChargeIfEligible(args: {
  supabase: SupabaseClient;
  workspace: WorkspaceRow;
  number: WorkspaceNumberRow;
  cycleKey: string;
  dueDate: Date;
}) {
  const existing = await hasChargeForCycle({
    supabase: args.supabase,
    workspaceId: args.workspace.id,
    numberId: args.number.id,
    cycleKey: args.cycleKey,
  });
  if (existing) return { charged: false, reason: "already_charged" } as const;

  const credits = args.workspace.credits ?? 0;
  if (credits < RENTED_NUMBER_MONTHLY_CREDITS) {
    return { charged: false, reason: "insufficient_credits" } as const;
  }

  const note = [
    `Rented number monthly renewal - ${args.number.phone_number ?? args.number.friendly_name ?? "unknown"}`,
    `(cycle ${args.cycleKey}, due ${formatDateIsoUtc(args.dueDate)})`,
  ].join(" ");

  const { error } = await args.supabase.from("transaction_history").insert({
    workspace: args.workspace.id,
    amount: -RENTED_NUMBER_MONTHLY_CREDITS,
    type: "DEBIT",
    note,
    idempotency_key: chargeIdempotencyKey(args.number.id, args.cycleKey),
  });
  if (error) throw error;
  return { charged: true, reason: "charged" } as const;
}

async function removeTwilioNumber(args: {
  workspace: WorkspaceRow;
  number: WorkspaceNumberRow;
}) {
  const twilioData = asRecord(args.workspace.twilio_data);
  const sid =
    typeof twilioData.sid === "string" && twilioData.sid.length > 0
      ? twilioData.sid
      : null;
  const authToken =
    typeof twilioData.authToken === "string" && twilioData.authToken.length > 0
      ? twilioData.authToken
      : null;
  if (!sid || !authToken) {
    throw new Error(`Missing Twilio credentials for workspace ${args.workspace.id}`);
  }

  const twilio = new Twilio(sid, authToken);
  const phoneNumber = args.number.phone_number ?? undefined;
  const friendlyName = args.number.friendly_name ?? undefined;

  const incoming = phoneNumber
    ? await twilio.incomingPhoneNumbers.list({ phoneNumber, limit: 20 })
    : friendlyName
      ? await twilio.incomingPhoneNumbers.list({ friendlyName, limit: 20 })
      : [];
  for (const row of incoming) {
    await twilio.incomingPhoneNumbers(row.sid).remove();
  }
}

async function maybeSendNotice(args: {
  supabase: SupabaseClient;
  number: WorkspaceNumberRow;
  workspace: WorkspaceRow;
  state: RentalBillingState;
  windowKey: NotificationWindowKey;
  cycleKey: string;
  dueDate: Date;
}) {
  const key = noticeKey({ cycleKey: args.cycleKey, windowKey: args.windowKey });
  if (args.state.notifications[key]) {
    return false;
  }
  const recipients = await getWorkspaceContacts(args.supabase, args.workspace.id);
  const workspaceName = args.workspace.name ?? args.workspace.id;
  const numberLabel = args.number.phone_number ?? args.number.friendly_name ?? "Unknown";
  const dueDateIso = formatDateIsoUtc(args.dueDate);
  await sendEmail({
    to: recipients,
    subject: buildReminderSubject({
      windowKey: args.windowKey,
      workspaceName,
      phoneNumber: numberLabel,
    }),
    html: buildReminderHtml({
      workspaceName,
      phoneNumber: numberLabel,
      dueDate: dueDateIso,
      windowKey: args.windowKey,
    }),
    text:
      args.windowKey === "post30"
        ? `${numberLabel} for workspace ${workspaceName} has been released after grace period.`
        : `${numberLabel} for workspace ${workspaceName} renews on ${dueDateIso} for ${RENTED_NUMBER_MONTHLY_CREDITS} credits/month.`,
  });
  const nextState: RentalBillingState = {
    ...args.state,
    notifications: {
      ...args.state.notifications,
      [key]: new Date().toISOString(),
    },
  };
  const nextCaps = writeRentalBillingState(args.number.capabilities, nextState);
  const { error } = await args.supabase
    .from("workspace_number")
    .update({ capabilities: nextCaps })
    .eq("id", args.number.id)
    .eq("workspace", args.workspace.id);
  if (error) throw error;
  args.state.notifications = nextState.notifications;
  return true;
}

async function processNumber(args: {
  supabase: SupabaseClient;
  number: WorkspaceNumberRow;
  workspace: WorkspaceRow;
  now: Date;
}) {
  const state = readRentalBillingState(args.number.capabilities);
  const anchor = utcDayStart(new Date(args.number.created_at));
  if (!isAtOrAfterRolloutStart(anchor)) {
    return "skipped_rollout" as const;
  }
  const dueDates = getRelevantDueDates(anchor, args.now);

  const currentDue = dueDates[0];
  const currentCycleKey = formatCycleKey(currentDue);
  if (formatDateIsoUtc(args.now) === formatDateIsoUtc(currentDue)) {
    await insertChargeIfEligible({
      supabase: args.supabase,
      workspace: args.workspace,
      number: args.number,
      cycleKey: currentCycleKey,
      dueDate: currentDue,
    });
  }

  for (const dueDate of dueDates) {
    const cycleKey = formatCycleKey(dueDate);
    const windowKey = resolveNotificationWindow(args.now, dueDate);
    if (!windowKey) continue;

    if (windowKey === "post30") {
      const paid = await hasChargeForCycle({
        supabase: args.supabase,
        workspaceId: args.workspace.id,
        numberId: args.number.id,
        cycleKey,
      });
      if (paid) {
        continue;
      }
      await maybeSendNotice({
        supabase: args.supabase,
        number: args.number,
        workspace: args.workspace,
        state,
        windowKey,
        cycleKey,
        dueDate,
      });
      await removeTwilioNumber({ workspace: args.workspace, number: args.number });
      const { error } = await args.supabase
        .from("workspace_number")
        .delete()
        .eq("id", args.number.id)
        .eq("workspace", args.workspace.id);
      if (error) throw error;
      return "released" as const;
    }

    await maybeSendNotice({
      supabase: args.supabase,
      number: args.number,
      workspace: args.workspace,
      state,
      windowKey,
      cycleKey,
      dueDate,
    });
  }
  return "processed" as const;
}

export async function handleRequest(_request: Request): Promise<Response> {
  try {
    const supabase = createSupabase();
    const now = utcDayStart(new Date());

    const { data: numbers, error: numbersError } = await supabase
      .from("workspace_number")
      .select("id, workspace, phone_number, friendly_name, created_at, capabilities, type")
      .eq("type", "rented");
    if (numbersError) throw numbersError;

    const workspaceIds = Array.from(
      new Set((numbers ?? []).map((row) => row.workspace)),
    );
    const { data: workspaces, error: wsError } = await supabase
      .from("workspace")
      .select("id, name, credits, twilio_data")
      .in("id", workspaceIds);
    if (wsError) throw wsError;

    const workspaceMap = new Map<string, WorkspaceRow>();
    for (const workspace of workspaces ?? []) {
      workspaceMap.set(workspace.id, workspace);
    }

    const results: Array<{ numberId: number; workspaceId: string; status: string }> = [];
    for (const number of (numbers ?? []) as WorkspaceNumberRow[]) {
      const workspace = workspaceMap.get(number.workspace);
      if (!workspace) continue;
      try {
        const status = await processNumber({
          supabase,
          number,
          workspace,
          now,
        });
        if (status === "skipped_rollout") {
          results.push({
            numberId: number.id,
            workspaceId: workspace.id,
            status: `skipped_before_${NUMBER_RENTAL_BILLING_ROLLOUT_START_DATE}`,
          });
          continue;
        }
        results.push({
          numberId: number.id,
          workspaceId: workspace.id,
          status,
        });
      } catch (error) {
        results.push({
          numberId: number.id,
          workspaceId: workspace.id,
          status:
            error instanceof Error ? `error:${error.message}` : "error:unknown",
        });
      }
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
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
