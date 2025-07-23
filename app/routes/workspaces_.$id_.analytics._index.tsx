import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link, Outlet } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { 
  Phone, 
  MessageSquare, 
  Activity,
  BarChart3,
  Target,
  ArrowRight,
  Users,
  Clock,
  CheckCircle,
  XCircle
} from "lucide-react";
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
    workspaceId 
  });
  if (!userRole) {
    throw new Response("Access denied", { status: 403 });
  }

  // Fetch basic metrics for overview
  const { data: campaigns } = await supabaseClient
    .from('campaign')
    .select(`
      id,
      title,
      status,
      type,
      created_at,
      outreach_attempt!inner(count),
      call!inner(count)
    `)
    .eq('workspace', workspaceId)
    .order('created_at', { ascending: false });

  // Fetch recent outreach attempts for metrics
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const { data: outreachAttempts } = await supabaseClient
    .from('outreach_attempt')
    .select(`
      id,
      disposition,
      created_at,
      campaign:campaign_id(type)
    `)
    .eq('workspace', workspaceId)
    .gte('created_at', lastWeek.toISOString());

  // Calculate basic metrics
  const totalCampaigns = (campaigns || []).length;
  const activeCampaigns = (campaigns || []).filter(campaign => campaign.status === 'running').length;
  
  const liveCallCampaigns = (campaigns || []).filter(campaign => campaign.type === 'live_call').length;
  const smsCampaigns = (campaigns || []).filter(campaign => campaign.type === 'sms').length;
  const ivrCampaigns = (campaigns || []).filter(campaign => campaign.type === 'ivr').length;

  const totalAttempts = (outreachAttempts || []).length;
  const completedAttempts = (outreachAttempts || []).filter(attempt => attempt.disposition === 'completed').length;
  const completionRate = totalAttempts > 0 ? (completedAttempts / totalAttempts) * 100 : 0;

  const metrics: AnalyticsMetrics = {
    totalCalls: totalAttempts,
    completedCalls: completedAttempts,
    failedCalls: totalAttempts - completedAttempts,
    voicemailCalls: 0, // Will be calculated in specific routes
    completionRate,
    averageCallDuration: 0, // Will be calculated in specific routes
    activeCampaigns,
    totalCampaigns,
    liveCallCount: 0 // Will be calculated in specific routes
  };

  return json({
    campaigns: (campaigns || []) as any,
    outreachAttempts: (outreachAttempts || []) as any,
    metrics,
    campaignTypeCounts: {
      liveCall: liveCallCampaigns,
      sms: smsCampaigns,
      ivr: ivrCampaigns
    }
  });
}

export default function AnalyticsIndex() {
  const { campaigns, outreachAttempts, metrics, campaignTypeCounts } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
          <p className="text-muted-foreground">
            Real-time insights into your workspace performance
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Activity className="h-5 w-5 text-green-500 animate-pulse" />
          <span className="text-sm text-muted-foreground">Live Updates</span>
        </div>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.activeCampaigns} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Attempts (7d)</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalCalls}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.completionRate.toFixed(1)}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completedCalls}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.failedCalls}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Type Navigation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="live_call">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-blue-500" />
                <span>Live Call Analytics</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </CardTitle>
              <CardDescription>
                Real-time call tracking and performance metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{campaignTypeCounts.liveCall}</div>
                <Badge variant="outline">Live Calls</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Active calls, completion rates, and call insights
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="sms">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-green-500" />
                <span>SMS Analytics</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </CardTitle>
              <CardDescription>
                SMS campaign performance and delivery metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{campaignTypeCounts.sms}</div>
                <Badge variant="outline">SMS Campaigns</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Delivery rates, response tracking, and engagement
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to="ivr">
          <Card className="hover:shadow-lg transition-shadow cursor-pointer group">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="h-5 w-5 text-purple-500" />
                <span>IVR Analytics</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
              </CardTitle>
              <CardDescription>
                Interactive Voice Response system analytics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{campaignTypeCounts.ivr}</div>
                <Badge variant="outline">IVR Campaigns</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Call flows, menu navigation, and response patterns
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Activity Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Recent Activity Summary</span>
          </CardTitle>
          <CardDescription>
            Overview of recent campaign activity across all types
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-blue-500" />
              <span className="text-sm">Live Calls: {campaignTypeCounts.liveCall} campaigns</span>
            </div>
            <div className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-green-500" />
              <span className="text-sm">SMS: {campaignTypeCounts.sms} campaigns</span>
            </div>
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4 text-purple-500" />
              <span className="text-sm">IVR: {campaignTypeCounts.ivr} campaigns</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Render child routes */}
      <Outlet />
    </div>
  );
} 