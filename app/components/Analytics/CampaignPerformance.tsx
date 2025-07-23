import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "~/components/ui/table";
import { 
  Target, 
  TrendingUp, 
  BarChart3, 
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  Calendar,
  Phone,
  MessageSquare,
  Voicemail
} from "lucide-react";

interface Campaign {
  id: number;
  title: string;
  status: string | null;
  type: string | null;
  created_at: string;
  outreach_attempt: { count: number };
  call: { count: number };
}

interface OutreachAttempt {
  id: number;
  disposition: string | null;
  created_at: string;
  result?: any;
  answered_at?: string | null;
  campaign: { title: string };
  contact: { firstname?: string | null; surname?: string | null; phone?: string | null };
  user: { username?: string; first_name?: string; last_name?: string } | null;
}

interface CampaignPerformanceProps {
  campaigns: Campaign[];
  outreachAttempts: OutreachAttempt[];
}

export function CampaignPerformance({ campaigns, outreachAttempts }: CampaignPerformanceProps) {
  const getCampaignTypeIcon = (type: string) => {
    switch (type) {
      case 'live_call':
        return <Users className="h-4 w-4" />;
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'robocall':
        return <Phone className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Running</Badge>;
      case 'complete':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Complete</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getCampaignTypeBadge = (type: string) => {
    switch (type) {
      case 'live_call':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Live Call</Badge>;
      case 'message':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Message</Badge>;
      case 'robocall':
        return <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Robocall</Badge>;
      case 'simple_ivr':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Simple IVR</Badge>;
      case 'complex_ivr':
        return <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Complex IVR</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const calculateCampaignMetrics = (campaignId: number) => {
    const campaignAttempts = outreachAttempts.filter(attempt => {
      // Find attempts that belong to this campaign
      return attempt.campaign.title === campaigns.find(c => c.id === campaignId)?.title;
    });

    const totalAttempts = campaignAttempts.length;
    const completedAttempts = campaignAttempts.filter(a => a.disposition === 'completed').length;
    const voicemailAttempts = campaignAttempts.filter(a => a.disposition === 'voicemail').length;
    const noAnswerAttempts = campaignAttempts.filter(a => a.disposition === 'no-answer').length;

    return {
      totalAttempts,
      completedAttempts,
      voicemailAttempts,
      noAnswerAttempts,
      successRate: totalAttempts > 0 ? (completedAttempts / totalAttempts) * 100 : 0,
      voicemailRate: totalAttempts > 0 ? (voicemailAttempts / totalAttempts) * 100 : 0,
      noAnswerRate: totalAttempts > 0 ? (noAnswerAttempts / totalAttempts) * 100 : 0
    };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-6">
      {/* Campaign Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{campaigns.length}</div>
            <p className="text-xs text-muted-foreground">
              Across all types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.filter(c => c.status === 'running').length}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently running
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.reduce((acc, c) => acc + (c.outreach_attempt?.count || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {campaigns.reduce((acc, c) => acc + (c.call?.count || 0), 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across all campaigns
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Campaign Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Campaign Type Distribution</span>
          </CardTitle>
          <CardDescription>
            Breakdown of campaigns by type
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {['live_call', 'message', 'robocall', 'simple_ivr', 'complex_ivr'].map((type) => {
              const count = campaigns.filter(c => c.type === type).length;
              const percentage = campaigns.length > 0 ? (count / campaigns.length) * 100 : 0;
              
              return count > 0 ? (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {getCampaignTypeIcon(type)}
                    <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm font-medium">{count}</span>
                    <span className="text-xs text-muted-foreground">({percentage.toFixed(1)}%)</span>
                    <div className="w-20">
                      <Progress value={percentage} className="h-2" />
                    </div>
                  </div>
                </div>
              ) : null;
            })}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Campaign Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <TrendingUp className="h-5 w-5" />
            <span>Campaign Performance Details</span>
          </CardTitle>
          <CardDescription>
            Detailed metrics for each campaign
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Success Rate</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const metrics = calculateCampaignMetrics(campaign.id);
                  
                  return (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{campaign.title}</div>
                          <div className="text-sm text-muted-foreground">
                            ID: {campaign.id}
                          </div>
                        </div>
                      </TableCell>
                                             <TableCell>
                         <div className="flex items-center space-x-2">
                           {getCampaignTypeIcon(campaign.type || 'unknown')}
                           {getCampaignTypeBadge(campaign.type || 'unknown')}
                         </div>
                       </TableCell>
                       <TableCell>
                         {getCampaignStatusBadge(campaign.status || 'unknown')}
                       </TableCell>
                      <TableCell>
                        <div className="text-right">
                          <div className="font-medium">{campaign.outreach_attempt?.count || 0}</div>
                          <div className="text-xs text-muted-foreground">
                            {metrics.totalAttempts} recent
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-right">
                          <div className="font-medium">{campaign.call?.count || 0}</div>
                          <div className="text-xs text-muted-foreground">
                            Total calls
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <div className="text-sm font-medium">
                            {metrics.successRate.toFixed(1)}%
                          </div>
                          <div className="w-16">
                            <Progress value={metrics.successRate} className="h-2" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-muted-foreground">
                          {formatDate(campaign.created_at)}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Campaign Disposition Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Overall Disposition Breakdown</span>
          </CardTitle>
          <CardDescription>
            How all outreach attempts are being resolved
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {(() => {
              const totalAttempts = outreachAttempts.length;
              const completedAttempts = outreachAttempts.filter(a => a.disposition === 'completed').length;
              const voicemailAttempts = outreachAttempts.filter(a => a.disposition === 'voicemail').length;
              const noAnswerAttempts = outreachAttempts.filter(a => a.disposition === 'no-answer').length;
              const busyAttempts = outreachAttempts.filter(a => a.disposition === 'busy').length;
              const inProgressAttempts = outreachAttempts.filter(a => a.disposition === 'in-progress').length;

              const dispositions = [
                { name: 'Completed', count: completedAttempts, icon: CheckCircle, color: 'text-green-500' },
                { name: 'Voicemail', count: voicemailAttempts, icon: Voicemail, color: 'text-orange-500' },
                { name: 'No Answer', count: noAnswerAttempts, icon: XCircle, color: 'text-red-500' },
                { name: 'Busy', count: busyAttempts, icon: XCircle, color: 'text-red-500' },
                { name: 'In Progress', count: inProgressAttempts, icon: Activity, color: 'text-blue-500' }
              ];

              return dispositions.map(({ name, count, icon: Icon, color }) => {
                const percentage = totalAttempts > 0 ? (count / totalAttempts) * 100 : 0;
                
                return (
                  <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Icon className={`h-4 w-4 ${color}`} />
                      <span className="text-sm">{name}</span>
                    </div>
                    <div className="flex items-center space-x-4">
                      <span className="text-sm font-medium">{count}</span>
                      <span className="text-xs text-muted-foreground">({percentage.toFixed(1)}%)</span>
                      <div className="w-24">
                        <Progress value={percentage} className="h-2" />
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 