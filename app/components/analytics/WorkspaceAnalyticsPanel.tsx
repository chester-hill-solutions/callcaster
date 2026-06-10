import { useSearchParams } from "react-router";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAnalyticsDuration,
  type WorkspaceAnalyticsResult,
} from "../../../shared/workspace-analytics";

type WorkspaceAnalyticsPanelProps = {
  analytics: WorkspaceAnalyticsResult;
  workspaceUsers: Array<{ id: string; label: string }>;
  canFilterUsers: boolean;
  currentUserId: string;
};

const ALL_USERS_VALUE = "all";

function toDateInputValue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function MetricCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="font-Zilla-Slab text-3xl font-bold text-brand-primary">{value}</p>
        {detail ? <p className="mt-1 text-sm text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}

export function WorkspaceAnalyticsPanel({
  analytics,
  workspaceUsers,
  canFilterUsers,
  currentUserId,
}: WorkspaceAnalyticsPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const connectRate =
    analytics.summary.totalDials > 0
      ? Math.round((analytics.summary.totalConnected / analytics.summary.totalDials) * 100)
      : 0;

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (!value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    setSearchParams(params);
  };

  const handleDateChange = (key: "from" | "to", value: string) => {
    if (!value) return;
    const parsed = new Date(`${value}T00:00:00`);
    if (key === "to") {
      parsed.setHours(23, 59, 59, 999);
    }
    updateParam(key, parsed.toISOString());
  };

  const selectedUserId = analytics.scopedUserId ?? ALL_USERS_VALUE;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="analytics-from">
            From
          </label>
          <Input
            id="analytics-from"
            type="date"
            value={toDateInputValue(analytics.range.from)}
            onChange={(event) => handleDateChange("from", event.target.value)}
            className="w-[180px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="analytics-to">
            To
          </label>
          <Input
            id="analytics-to"
            type="date"
            value={toDateInputValue(analytics.range.to)}
            onChange={(event) => handleDateChange("to", event.target.value)}
            className="w-[180px]"
          />
        </div>
        {canFilterUsers ? (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="analytics-user">
              User
            </label>
            <Select
              value={selectedUserId}
              onValueChange={(value) =>
                updateParam("userId", value === ALL_USERS_VALUE ? "" : value)
              }
            >
              <SelectTrigger id="analytics-user" className="w-[220px]">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_USERS_VALUE}>All users</SelectItem>
                {workspaceUsers.map((workspaceUser) => (
                  <SelectItem key={workspaceUser.id} value={workspaceUser.id}>
                    {workspaceUser.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <p className="self-end text-sm text-muted-foreground">
            Showing your caller stats only.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Total dials" value={String(analytics.summary.totalDials)} />
        <MetricCard
          title="Total connected"
          value={String(analytics.summary.totalConnected)}
          detail={`${connectRate}% connect rate`}
        />
        <MetricCard
          title="Dialing time"
          value={formatAnalyticsDuration(analytics.summary.dialingSeconds)}
        />
        <MetricCard
          title="Connected on line"
          value={formatAnalyticsDuration(analytics.summary.connectedSeconds)}
        />
        <MetricCard
          title="Caller interface time"
          value={formatAnalyticsDuration(analytics.summary.interfaceSeconds)}
        />
      </div>

      {canFilterUsers && analytics.users.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="font-Zilla-Slab text-xl">By user</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Dials</TableHead>
                  <TableHead>Connected</TableHead>
                  <TableHead>Dialing</TableHead>
                  <TableHead>On line</TableHead>
                  <TableHead>Interface</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.users.map((row) => (
                  <TableRow
                    key={row.userId}
                    className={row.userId === currentUserId ? "bg-muted/40" : undefined}
                  >
                    <TableCell className="font-medium">
                      {row.label}
                      {row.userId === currentUserId ? " (you)" : ""}
                    </TableCell>
                    <TableCell>{row.totalDials}</TableCell>
                    <TableCell>{row.totalConnected}</TableCell>
                    <TableCell>{formatAnalyticsDuration(row.dialingSeconds)}</TableCell>
                    <TableCell>{formatAnalyticsDuration(row.connectedSeconds)}</TableCell>
                    <TableCell>{formatAnalyticsDuration(row.interfaceSeconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
