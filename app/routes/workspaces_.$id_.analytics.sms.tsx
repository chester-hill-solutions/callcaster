import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { verifyAuth } from "~/lib/supabase.server";
import { getUserRole } from "~/lib/database.server";
import { User } from "~/lib/types";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { 
  MessageSquare, 
  CheckCircle, 
  XCircle, 
  Clock, 
  BarChart3,
  TrendingUp,
  Users,
  Activity
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

  // Fetch SMS campaigns
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
    .eq('type', 'sms')
    .order('created_at', { ascending: false });

  // Fetch SMS outreach attempts for the last 7 days
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  const { data: outreachAttempts } = await supabaseClient
    .from('outreach_attempt')
    .select(`
      id,
      disposition,
      created_at,
      result,
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
    .eq('campaign.type', 'sms')
    .gte('created_at', lastWeek.toISOString())
    .order('created_at', { ascending: false });

  // Calculate SMS-specific metrics
  const totalSMS = (outreachAttempts || []).length;
  const deliveredSMS = (outreachAttempts || []).filter(attempt => attempt.disposition === 'delivered').length;
  const failedSMS = (outreachAttempts || []).filter(attempt => ['failed', 'undelivered'].includes(attempt.disposition || '')).length;
  const pendingSMS = (outreachAttempts || []).filter(attempt => ['queued', 'sending'].includes(attempt.disposition || '')).length;
  const deliveryRate = totalSMS > 0 ? (deliveredSMS / totalSMS) * 100 : 0;

  const activeCampaigns = (campaigns || []).filter(campaign => campaign.status === 'running').length;
  const totalCampaigns = (campaigns || []).length;

  const metrics: AnalyticsMetrics = {
    totalCalls: totalSMS,
    completedCalls: deliveredSMS,
    failedCalls: failedSMS,
    voicemailCalls: 0, // Not applicable for SMS
    completionRate: deliveryRate,
    averageCallDuration: 0, // Not applicable for SMS
    activeCampaigns,
    totalCampaigns,
    liveCallCount: 0 // Not applicable for SMS
  };

  return json({
    campaigns: (campaigns || []) as any,
    outreachAttempts: (outreachAttempts || []) as any,
    metrics,
    smsMetrics: {
      totalSMS,
      deliveredSMS,
      failedSMS,
      pendingSMS,
      deliveryRate
    }
  });
}

export default function SMSAnalyticsRoute() {
  const { campaigns, outreachAttempts, metrics, smsMetrics } = useLoaderData<typeof loader>();

  const getDispositionBadge = (disposition?: string | null) => {
    if (!disposition) return <Badge variant="outline">Unknown</Badge>;
    
    switch (disposition.toLowerCase()) {
      case 'delivered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Delivered</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      case 'undelivered':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Undelivered</Badge>;
      case 'queued':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Queued</Badge>;
      case 'sending':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Sending</Badge>;
      default:
        return <Badge variant="outline">{disposition}</Badge>;
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

  return (
    <div className="space-y-6">
      {/* SMS Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total SMS (7d)</CardTitle>
            <MessageSquare className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{smsMetrics.totalSMS}</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{smsMetrics.deliveredSMS}</div>
            <p className="text-xs text-muted-foreground">
              {smsMetrics.deliveryRate.toFixed(1)}% delivery rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{smsMetrics.failedSMS}</div>
            <p className="text-xs text-muted-foreground">
              {smsMetrics.totalSMS > 0 ? ((smsMetrics.failedSMS / smsMetrics.totalSMS) * 100).toFixed(1) : 0}% failure rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{smsMetrics.pendingSMS}</div>
            <p className="text-xs text-muted-foreground">
              In queue or sending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeCampaigns}</div>
            <p className="text-xs text-muted-foreground">
              of {metrics.totalCampaigns} total
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SMS Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>SMS Campaign Performance</span>
          </CardTitle>
          <CardDescription>
            Performance metrics for your SMS campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No SMS campaigns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total SMS</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Failed</TableHead>
                  <TableHead>Delivery Rate</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const campaignAttempts = outreachAttempts.filter(
                    attempt => attempt.campaign?.id === campaign.id
                  );
                  const total = campaignAttempts.length;
                  const delivered = campaignAttempts.filter(
                    attempt => attempt.disposition === 'delivered'
                  ).length;
                  const deliveryRate = total > 0 ? (delivered / total) * 100 : 0;

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
                      <TableCell className="text-green-600">{delivered}</TableCell>
                      <TableCell className="text-red-600">{total - delivered}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-500 h-2 rounded-full" 
                              style={{ width: `${deliveryRate}%` }}
                            />
                          </div>
                          <span className="text-sm">{deliveryRate.toFixed(1)}%</span>
                        </div>
                      </TableCell>
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

      {/* Recent SMS Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Recent SMS Activity</span>
          </CardTitle>
          <CardDescription>
            Recent SMS delivery activity from the last 7 days
          </CardDescription>
        </CardHeader>
        <CardContent>
          {outreachAttempts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent SMS activity</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outreachAttempts.slice(0, 20).map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="font-medium">
                      {formatContactName(attempt.contact?.firstname, attempt.contact?.surname)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatPhoneNumber(attempt.contact?.phone)}
                    </TableCell>
                    <TableCell>
                      {attempt.campaign?.title || 'Unknown'}
                    </TableCell>
                    <TableCell>
                      {getDispositionBadge(attempt.disposition)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {attempt.user?.username || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDistanceToNow(new Date(attempt.created_at), { addSuffix: true })}
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