import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";
import { LiveCallAnalytics } from "~/components/Analytics/LiveCallAnalytics";
import type { AnalyticsMetrics } from "~/lib/analytics.types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;

  if (!workspaceId) {
    throw new Response("Workspace ID is required", { status: 400 });
  }

  // Check user permissions for this workspace
  const userRole = await getUserRole({
    supabaseClient,
    user: user as unknown as User,
    workspaceId,
  });
  if (!userRole) {
    throw new Response("Access denied", { status: 403 });
  }

  // Fetch live calls with questions and answers (only for live_call campaigns)
  const { data: liveCallsData } = await supabaseClient
    .from("call")
    .select(
      `
      *,
      contact:contact_id(firstname, surname, phone),
      campaign:campaign_id(id, title, type, live_campaign(id, script(*))),
      outreach_attempt:outreach_attempt_id(
        user_id:user(id, username),
        disposition,
        answered_at,
        ended_at,
        result
      )
    `,
    )
    .eq("workspace", workspaceId)
    .eq("is_last", true)
    .in("status", ["in-progress", "ringing", "queued"])
    .eq("campaign.type", "live_call")
    .order("date_created", { ascending: false });

  // Fetch recent calls with questions and answers (only for live_call campaigns)
  const { data: recentCallsData } = await supabaseClient
    .from("call")
    .select(
      `
      *,
      contact:contact_id(firstname, surname, phone),
      campaign:campaign_id(id, title, type, live_campaign(id, script(*))),
      outreach_attempt:outreach_attempt_id(
        user_id:user(id, username),
        disposition,
        answered_at,
        ended_at,
        result
      )
    `,
    )
    .eq("workspace", workspaceId)
    .in("status", ["completed", "failed", "busy", "no-answer", "canceled"])
    .eq("campaign.type", "live_call")
    .order("date_created", { ascending: false })
    .limit(50);

  // Fetch outreach attempts for the last 7 days (only live_call campaigns)
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);

  const totalCalls = (recentCallsData || []).length;
  const completedCalls = (recentCallsData || []).filter(
    (call) => call.status === "completed",
  ).length;
  const failedCalls = (recentCallsData || []).filter((call) =>
    ["failed", "busy", "no-answer"].includes(call.status || ""),
  ).length;
  const voicemailCalls = (recentCallsData || []).filter(
    (call) => call.answered_by === "machine",
  ).length;
  const completionRate =
    totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
  const averageCallDuration =
    (recentCallsData || [])
      .filter((call) => call.call_duration)
      .reduce((acc, call) => acc + (call.call_duration || 0), 0) /
      ((recentCallsData || []).filter((call) => call.call_duration).length ||
        1) || 0;

  const metrics: AnalyticsMetrics = {
    totalCalls,
    completedCalls,
    failedCalls,
    voicemailCalls,
    completionRate,
    averageCallDuration,
    liveCallCount: (liveCallsData || []).length,
  };

  return json({
    liveCalls: (liveCallsData || []) as any,
    recentCalls: (recentCallsData || []) as any,
    metrics,
  });
}

export default function LiveCallAnalyticsRoute() {
  const { liveCalls, recentCalls, metrics } = useLoaderData<typeof loader>();
  return (
    <div className="space-y-4 p-8">
      <LiveCallAnalytics
        liveCalls={liveCalls}
        recentCalls={recentCalls}
        metrics={metrics}
      />
    </div>
  );
}
