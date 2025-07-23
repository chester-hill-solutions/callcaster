import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  BarChart3,
  TrendingUp,
  Users,
  Phone,
  Play,
  Pause,
  Square
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
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

  // Fetch IVR campaigns
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
    .eq('type', 'ivr')
    .order('created_at', { ascending: false });

  // Fetch IVR calls for the last 7 days
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const { data: ivrCalls } = await supabaseClient
    .from('call')
    .select(`
      *,
      contact:contact_id(firstname, surname, phone),
      campaign:campaign_id(id, title, type, ivr_campaign(id, script(*))),
      outreach_attempt:outreach_attempt_id(
        user_id,
        disposition,
        answered_at,
        ended_at,
        result
      )
    `)
    .eq('workspace', workspaceId)
    .eq('campaign.type', 'ivr')
    .gte('date_created', lastWeek.toISOString())
    .order('date_created', { ascending: false });

  // Fetch IVR outreach attempts for metrics
  const { data: outreachAttempts } = await supabaseClient
    .from('outreach_attempt')
    .select(`
      id,
      disposition,
      created_at,
      result,
      answered_at,
      ended_at,
      campaign:campaign_id (
        title,
        type
      ),
      contact:contact_id (
        firstname,
        surname,
        phone
      ),
      user:user_id (
        username,
        first_name,
        last_name
      )
    `)
    .eq('workspace', workspaceId)
    .eq('campaign.type', 'ivr')
    .gte('created_at', lastWeek.toISOString())
    .order('created_at', { ascending: false });

  // Calculate IVR-specific metrics
  const totalIVRCalls = (ivrCalls || []).length;
  const completedIVRCalls = (ivrCalls || []).filter(call => call.status === 'completed').length;
  const failedIVRCalls = (ivrCalls || []).filter(call => ['failed', 'busy', 'no-answer'].includes(call.status || '')).length;
  const voicemailIVRCalls = (ivrCalls || []).filter(call => call.answered_by === 'machine').length;
  const completionRate = totalIVRCalls > 0 ? (completedIVRCalls / totalIVRCalls) * 100 : 0;
  const averageCallDuration = (ivrCalls || []).filter(call => call.call_duration)
    .reduce((acc, call) => acc + (call.call_duration || 0), 0) / 
    ((ivrCalls || []).filter(call => call.call_duration).length || 1) || 0;

  const activeCampaigns = (campaigns || []).filter(campaign => campaign.status === 'running').length;
  const totalCampaigns = (campaigns || []).length;

  const metrics: AnalyticsMetrics = {
    totalCalls: totalIVRCalls,
    completedCalls: completedIVRCalls,
    failedCalls: failedIVRCalls,
    voicemailCalls: voicemailIVRCalls,
    completionRate,
    averageCallDuration,
    activeCampaigns,
    totalCampaigns,
    liveCallCount: 0 // Not applicable for IVR
  };

  return json({
    campaigns: (campaigns || []) as any,
    ivrCalls: (ivrCalls || []) as any,
    outreachAttempts: (outreachAttempts || []) as any,
    metrics,
    ivrMetrics: {
      totalIVRCalls,
      completedIVRCalls,
      failedIVRCalls,
      voicemailIVRCalls,
      completionRate,
      averageCallDuration
    }
  });
}

export default function IVRAnalyticsRoute() {
  const { campaigns, ivrCalls, outreachAttempts, metrics, ivrMetrics } = useLoaderData<typeof loader>();

  const getStatusBadge = (status: string | null | undefined) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      case 'busy':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Busy</Badge>;
      case 'no-answer':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">No Answer</Badge>;
      case 'canceled':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAnsweredByBadge = (answeredBy?: string | null) => {
    if (!answeredBy) return <Badge variant="outline">Unknown</Badge>;
    
    switch (answeredBy) {
      case 'human':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Human</Badge>;
      case 'machine':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Machine</Badge>;
      default:
        return <Badge variant="outline">{answeredBy}</Badge>;
    }
  };

  const formatContactName = (firstname?: string | null, surname?: string | null) => {
    const firstName = firstname?.trim() || '';
    const lastName = surname?.trim() || '';
    if (!firstName && !lastName) return 'Unknown Contact';
    return `${firstName} ${lastName}`.trim();
  };

  const formatPhoneNumber = (phone?: string | null) => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const formatDuration = (seconds?: number | null) => {
    if (!seconds || seconds <= 0) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getIVRInsights = (call: any) => {
    const insights = [];
    
    if (call.call_duration && call.call_duration < 30) {
      insights.push(<Badge key="quick" variant="outline" className="text-xs">Quick call</Badge>);
    }
    
    if (call.call_duration && call.call_duration > 300) {
      insights.push(<Badge key="long" variant="outline" className="text-xs">Long interaction</Badge>);
    }
    
    if (call.answered_by === 'human') {
      insights.push(<Badge key="human" variant="outline" className="text-xs">Human answered</Badge>);
    }
    
    if (call.answered_by === 'machine') {
      insights.push(<Badge key="voicemail" variant="outline" className="text-xs">Left voicemail</Badge>);
    }
    
    if (call.status === 'completed') {
      insights.push(<Badge key="completed" variant="outline" className="text-xs">Completed</Badge>);
    }
    
    return insights.length > 0 ? insights : <span className="text-muted-foreground">-</span>;
  };

  return (
    <div className="space-y-6">
      {/* IVR Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total IVR Calls (7d)</CardTitle>
            <Activity className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ivrMetrics.totalIVRCalls}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ivrMetrics.completedIVRCalls}</div>
            <p className="text-xs text-muted-foreground">
              {ivrMetrics.completionRate.toFixed(1)}% completion rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ivrMetrics.failedIVRCalls}</div>
            <p className="text-xs text-muted-foreground">
              {ivrMetrics.totalIVRCalls > 0 ? ((ivrMetrics.failedIVRCalls / ivrMetrics.totalIVRCalls) * 100).toFixed(1) : 0}% failure rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(ivrMetrics.averageCallDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per IVR call
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Play className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              of {metrics.totalCampaigns} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* IVR Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>IVR Campaign Performance</span>
          </CardTitle>
          <CardDescription>
            Performance metrics for your IVR campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No IVR campaigns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total Calls</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Completion Rate</TableHead>
                  <TableHead>Avg Duration</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const campaignCalls = ivrCalls.filter(
                    call => call.campaign?.id === campaign.id
                  );
                  const total = campaignCalls.length;
                  const completed = campaignCalls.filter(
                    call => call.status === 'completed'
                  ).length;
                  const completionRate = total > 0 ? (completed / total) * 100 : 0;
                  const avgDuration = campaignCalls.filter(call => call.call_duration)
                    .reduce((acc, call) => acc + (call.call_duration || 0), 0) / 
                    (campaignCalls.filter(call => call.call_duration).length || 1) || 0;

                  return (
                    <TableRow key={campaign.id}>
                      <TableCell className="font-medium">
                        {campaign.title}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={campaign.status === 'running' ? 'default' : 'secondary'}
                        >
                          {campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{total}</TableCell>
                      <TableCell className="text-green-600">{completed}</TableCell>
                      <TableCell className="text-red-600">{total - completed}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full" 
                              style={{ width: `${completionRate}%` }}
                            />
                          </div>
                          <span className="text-sm">{completionRate.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDuration(avgDuration)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent IVR Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Recent IVR Activity</span>
          </CardTitle>
          <CardDescription>
            Recent IVR call activity from the last 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ivrCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent IVR activity</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Answered By</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Insights</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ivrCalls.slice(0, 20).map((call) => (
                  <TableRow key={call.sid}>
                    <TableCell className="font-medium">
                      {formatContactName(call.contact?.firstname, call.contact?.surname)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatPhoneNumber(call.contact?.phone)}
                    </TableCell>
                    <TableCell>
                      {call.campaign?.title || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(call.status)}
                    </TableCell>
                    <TableCell>
                      {getAnsweredByBadge(call.answered_by)}
                    </TableCell>
                    <TableCell>
                      {call.call_duration ? formatDuration(call.call_duration) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(getIVRInsights(call)) ? 
                          getIVRInsights(call) : 
                          getIVRInsights(call)
                        }
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(call.date_created), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 