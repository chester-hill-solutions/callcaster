import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";
import { LiveCallAnalytics } from "~/components/Analytics/LiveCallAnalytics";
import type { AnalyticsMetrics } from "~/lib/analytics.types";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { supabaseClient, user } = await verifyAuth(request);
  const workspaceId = params.id;
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(10, parseInt(url.searchParams.get("pageSize") || "25")));
  const offset = (page - 1) * pageSize;

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
  //fetch campaigns from workspace that are live_call
  const { data: campaignsData } = await supabaseClient
    .from("campaign")
    .select("id, title, type, live_campaign(id, script(*))")
    .eq("workspace", workspaceId)
    .eq("type", "live_call");

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

  const { data: recentCallsData, count: totalCalls } = await supabaseClient
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
    { count: "exact" }
    )
    .eq("workspace", workspaceId)
    .in("status", ["completed", "failed", "busy", "no-answer", "canceled"])
    .eq("campaign.type", "live_call")
    .order("date_created", { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Fetch all scripts from live campaigns in this workspace to get questions
  const { data: scriptsData } = await supabaseClient
    .from("script")
    .select(`
      *,
      live_campaign!inner(id, campaign!inner(id, workspace))
    `)
    .eq("live_campaign.campaign.workspace", workspaceId);

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
    totalCalls && totalCalls > 0 ? (completedCalls / totalCalls) * 100 : 0;
  const averageCallDuration =
    (recentCallsData || [])
      .filter((call) => call.call_duration)
      .reduce((acc, call) => acc + (call.call_duration || 0), 0) /
      ((recentCallsData || []).filter((call) => call.call_duration).length ||
        1) || 0;

  const metrics: AnalyticsMetrics = {
    totalCalls: totalCalls || 0 ,
    completedCalls,
    failedCalls,
    voicemailCalls,
    completionRate,
    averageCallDuration,
    liveCallCount: (liveCallsData || []).length,
    activeCampaigns: 0,
    totalCampaigns: 0,
  };

  // Extract all unique questions from the script data
  const allQuestions = new Set<string>();
  (scriptsData || []).forEach(script => {
    if (script.steps) {
      try {
        const steps = typeof script.steps === 'string' ? JSON.parse(script.steps) : script.steps;
        if (steps && steps.pages) {
          Object.values(steps.pages).forEach((page: any) => {
            if (page.blocks) {
              Object.values(page.blocks).forEach((block: any) => {
                if (block.type === 'question' && block.question) {
                  allQuestions.add(block.question);
                }
              });
            }
          });
        }
      } catch (error) {
        console.error('Error parsing script steps:', error);
      }
    }
  });

  return json({
    liveCalls: (liveCallsData || []) as any,
    recentCalls: (recentCallsData || []) as any,
    metrics,
    allQuestions: Array.from(allQuestions),
    pagination: {
      currentPage: page,
      pageSize,
      totalCalls: totalCalls || 0,
      totalPages: Math.ceil((totalCalls || 0) / pageSize),
    },
  });
}

export default function LiveCallAnalyticsRoute() {
  const { liveCalls, recentCalls, metrics, pagination, allQuestions } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handlePageChange = (page: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("page", page.toString());
    setSearchParams(newSearchParams);
  };

  const handlePageSizeChange = (pageSize: number) => {
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set("pageSize", pageSize.toString());
    newSearchParams.set("page", "1"); // Reset to first page when changing page size
    setSearchParams(newSearchParams);
  };

  return (
    <div className="space-y-4 p-8">
      <LiveCallAnalytics
        liveCalls={liveCalls}
        recentCalls={recentCalls}
        metrics={metrics}
        pagination={pagination}
        allQuestions={allQuestions}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />
    </div>
  );
}
