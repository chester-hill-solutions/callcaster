import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Progress } from "~/components/ui/progress";
import { 
  Phone, 
  Clock, 
  Target,
  TrendingUp,
  BarChart3,
  Activity,
  CheckCircle,
  XCircle,
  Voicemail,
  User,
  Calendar
} from "lucide-react";

interface Call {
  sid: string;
  status: string | null;
  date_created: string;
  call_duration?: number | null;
  answered_by?: string | null;
  contact?: {
    firstname?: string | null;
    surname?: string | null;
    phone?: string | null;
  } | null;
  campaign?: {
    id?: number;
    title?: string;
  } | null;
  outreach_attempt?: {
    user_id?: string;
    disposition?: string | null;
    answered_at?: string | null;
    result?: any;
  } | null;
}

interface Metrics {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  voicemailCalls: number;
  completionRate: number;
  averageCallDuration: number;
  activeCampaigns: number;
  totalCampaigns: number;
  liveCallCount: number;
}

interface CallMetricsProps {
  recentCalls: Call[];
  metrics: Metrics;
}

export function CallMetrics({ recentCalls, metrics }: CallMetricsProps) {
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  // Calculate additional metrics
  const humanAnsweredCalls = recentCalls.filter(call => call.answered_by === 'human').length;
  const machineAnsweredCalls = recentCalls.filter(call => call.answered_by === 'machine').length;
  const unknownAnsweredCalls = recentCalls.filter(call => call.answered_by === 'unknown').length;

  const completedDispositions = recentCalls.filter(call => call.outreach_attempt?.disposition === 'completed').length;
  const voicemailDispositions = recentCalls.filter(call => call.outreach_attempt?.disposition === 'voicemail').length;
  const noAnswerDispositions = recentCalls.filter(call => call.outreach_attempt?.disposition === 'no-answer').length;

  const averageDuration = recentCalls.filter(call => call.call_duration)
    .reduce((acc, call) => acc + (call.call_duration || 0), 0) / 
    (recentCalls.filter(call => call.call_duration).length || 1);

  const longestCall = Math.max(...recentCalls.map(call => call.call_duration || 0));
  const shortestCall = Math.min(...recentCalls.filter(call => call.call_duration).map(call => call.call_duration || 0));

  return (
    <div className="space-y-6">
      {/* Call Performance Metrics */}
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
            <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatDuration(averageDuration)}
            </div>
            <p className="text-xs text-muted-foreground">
              Last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Human Answer Rate</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.totalCalls > 0 ? ((humanAnsweredCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {humanAnsweredCalls} human answers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Voicemail Rate</CardTitle>
            <Voicemail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.totalCalls > 0 ? ((metrics.voicemailCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics.voicemailCalls} voicemails
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Call Duration Analysis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Call Duration Analysis</span>
            </CardTitle>
            <CardDescription>
              Duration statistics for completed calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm">Average Duration</span>
              </div>
              <span className="text-sm font-medium">{formatDuration(averageDuration)}</span>
            </div>
            <Progress value={(averageDuration / 300) * 100} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Longest Call</span>
              </div>
              <span className="text-sm font-medium">{formatDuration(longestCall)}</span>
            </div>
            <Progress value={(longestCall / 600) * 100} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Shortest Call</span>
              </div>
              <span className="text-sm font-medium">{formatDuration(shortestCall)}</span>
            </div>
            <Progress value={(shortestCall / 60) * 100} className="h-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5" />
              <span>Answer Type Breakdown</span>
            </CardTitle>
            <CardDescription>
              How calls are being answered
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-green-500" />
                <span className="text-sm">Human Answered</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{humanAnsweredCalls}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalCalls > 0 ? ((humanAnsweredCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={metrics.totalCalls > 0 ? (humanAnsweredCalls / metrics.totalCalls) * 100 : 0} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Voicemail className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Machine Answered</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{machineAnsweredCalls}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalCalls > 0 ? ((machineAnsweredCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={metrics.totalCalls > 0 ? (machineAnsweredCalls / metrics.totalCalls) * 100 : 0} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <XCircle className="h-4 w-4 text-gray-500" />
                <span className="text-sm">Unknown</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{unknownAnsweredCalls}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalCalls > 0 ? ((unknownAnsweredCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={metrics.totalCalls > 0 ? (unknownAnsweredCalls / metrics.totalCalls) * 100 : 0} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Call Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Call Status Distribution</span>
          </CardTitle>
          <CardDescription>
            Breakdown of call outcomes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{metrics.completedCalls}</span>
                <span className="text-xs text-muted-foreground">({metrics.completionRate.toFixed(1)}%)</span>
              </div>
            </div>
            <Progress value={metrics.completionRate} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">Failed</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{metrics.failedCalls}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalCalls > 0 ? ((metrics.failedCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={metrics.totalCalls > 0 ? (metrics.failedCalls / metrics.totalCalls) * 100 : 0} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Voicemail className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Voicemail</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{metrics.voicemailCalls}</span>
                <span className="text-xs text-muted-foreground">
                  ({metrics.totalCalls > 0 ? ((metrics.voicemailCalls / metrics.totalCalls) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={metrics.totalCalls > 0 ? (metrics.voicemailCalls / metrics.totalCalls) * 100 : 0} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Outreach Disposition vs Call Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Outreach Disposition vs Call Status</span>
          </CardTitle>
          <CardDescription>
            Comparison between outreach dispositions and call outcomes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-sm">Completed Dispositions</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{completedDispositions}</span>
                <span className="text-xs text-muted-foreground">
                  ({recentCalls.length > 0 ? ((completedDispositions / recentCalls.length) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={recentCalls.length > 0 ? (completedDispositions / recentCalls.length) * 100 : 0} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Voicemail className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Voicemail Dispositions</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{voicemailDispositions}</span>
                <span className="text-xs text-muted-foreground">
                  ({recentCalls.length > 0 ? ((voicemailDispositions / recentCalls.length) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={recentCalls.length > 0 ? (voicemailDispositions / recentCalls.length) * 100 : 0} className="h-2" />

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm">No Answer Dispositions</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">{noAnswerDispositions}</span>
                <span className="text-xs text-muted-foreground">
                  ({recentCalls.length > 0 ? ((noAnswerDispositions / recentCalls.length) * 100).toFixed(1) : 0}%)
                </span>
              </div>
            </div>
            <Progress value={recentCalls.length > 0 ? (noAnswerDispositions / recentCalls.length) * 100 : 0} className="h-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 