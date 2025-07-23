import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { 
  Users, 
  Target, 
  Calendar,
  TrendingUp,
  BarChart3,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  Phone,
  Voicemail
} from "lucide-react";
import type { WorkspaceOverviewProps, CampaignStatus, CampaignType } from "~/lib/analytics.types";

export function WorkspaceOverview({ campaigns, outreachAttempts, metrics }: WorkspaceOverviewProps) {
  // Calculate additional metrics
  const totalOutreachAttempts = outreachAttempts.length;
  const successfulOutreach = outreachAttempts.filter(attempt => 
    attempt.disposition === 'completed'
  ).length;
  const voicemailAttempts = outreachAttempts.filter(attempt => 
    attempt.disposition === 'voicemail'
  ).length;
  const noAnswerAttempts = outreachAttempts.filter(attempt => 
    attempt.disposition === 'no-answer'
  ).length;

  const successRate = totalOutreachAttempts > 0 ? (successfulOutreach / totalOutreachAttempts) * 100 : 0;
  const voicemailRate = totalOutreachAttempts > 0 ? (voicemailAttempts / totalOutreachAttempts) * 100 : 0;
  const noAnswerRate = totalOutreachAttempts > 0 ? (noAnswerAttempts / totalOutreachAttempts) * 100 : 0;

  // Campaign status breakdown
  const runningCampaigns = campaigns.filter(c => c.status === 'running').length;
  const completedCampaigns = campaigns.filter(c => c.status === 'complete').length;
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length;
  const draftCampaigns = campaigns.filter(c => c.status === 'draft').length;

  const getCampaignTypeIcon = (type: CampaignType | null) => {
    if (!type) return <Target className="h-4 w-4" />;
    
    switch (type) {
      case 'live_call':
        return <Users className="h-4 w-4" />;
      case 'message':
        return <MessageSquare className="h-4 w-4" />;
      case 'robocall':
        return <Phone className="h-4 w-4" />;
      case 'simple_ivr':
      case 'complex_ivr':
        return <Phone className="h-4 w-4" />;
      case 'email':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Target className="h-4 w-4" />;
    }
  };

  const getCampaignStatusBadge = (status: CampaignStatus | null) => {
    if (!status) return <Badge variant="secondary">Unknown</Badge>;
    
    switch (status) {
      case 'running':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Running</Badge>;
      case 'complete':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Complete</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Paused</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Pending</Badge>;
      case 'scheduled':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Scheduled</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCampaignType = (type: CampaignType | null) => {
    if (!type) return 'Unknown';
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      {/* Key Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Call Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completionRate.toFixed(1)}%</div>
            <Progress value={metrics.completionRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {metrics.completedCalls} of {metrics.totalCalls} calls
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outreach Success</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{successRate.toFixed(1)}%</div>
            <Progress value={successRate} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-2">
              {successfulOutreach} of {totalOutreachAttempts} attempts
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(metrics.averageCallDuration)}s
            </div>
            <p className="text-xs text-muted-foreground">
              Last 24 hours
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

      {/* Outreach Attempt Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>Outreach Results (7 days)</span>
            </CardTitle>
            <CardDescription>
              Breakdown of outreach attempt outcomes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{successfulOutreach}</span>
                <span className="text-xs text-muted-foreground">({successRate.toFixed(1)}%)</span>
              </div>
            </div>
            <Progress value={successRate} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Voicemail className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Voicemail</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{voicemailAttempts}</span>
                <span className="text-xs text-muted-foreground">({voicemailRate.toFixed(1)}%)</span>
              </div>
            </div>
            <Progress value={voicemailRate} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">No Answer</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{noAnswerAttempts}</span>
                <span className="text-xs text-muted-foreground">({noAnswerRate.toFixed(1)}%)</span>
              </div>
            </div>
            <Progress value={noAnswerRate} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Target className="h-5 w-5" />
              <span>Campaign Status</span>
            </CardTitle>
            <CardDescription>
              Current campaign status breakdown
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-green-500" />
                <span className="text-sm">Running</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{runningCampaigns}</span>
                <span className="text-xs text-muted-foreground">
                  ({((runningCampaigns / metrics.totalCampaigns) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
            <Progress value={(runningCampaigns / metrics.totalCampaigns) * 100} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Complete</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{completedCampaigns}</span>
                <span className="text-xs text-muted-foreground">
                  ({((completedCampaigns / metrics.totalCampaigns) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
            <Progress value={(completedCampaigns / metrics.totalCampaigns) * 100} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">Paused</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{pausedCampaigns}</span>
                <span className="text-xs text-muted-foreground">
                  ({((pausedCampaigns / metrics.totalCampaigns) * 100).toFixed(1)}%)
                </span>
              </div>
            </div>
            <Progress value={(pausedCampaigns / metrics.totalCampaigns) * 100} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Recent Campaign Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Recent Campaign Activity</span>
          </CardTitle>
          <CardDescription>
            Latest campaigns and their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    {getCampaignTypeIcon(campaign.type)}
                    <div>
                      <div className="font-medium">{campaign.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatCampaignType(campaign.type)} • Created {new Date(campaign.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-sm font-medium">{campaign.outreach_attempt[0]?.count || 0}</div>
                      <div className="text-xs text-muted-foreground">Attempts</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{campaign.call[0]?.count || 0}</div>
                      <div className="text-xs text-muted-foreground">Calls</div>
                    </div>
                    {getCampaignStatusBadge(campaign.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 