import { useSearchParams } from "react-router";

import { Section, SectionHeader } from "@/components/shared/Section";
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

function MetricStat({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
    </div>
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
  const avgShiftDuration =
    analytics.summary.totalShifts > 0
      ? Math.round(analytics.summary.totalShiftSeconds / analytics.summary.totalShifts)
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

      <div className="grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-3 xl:grid-cols-6">
        <MetricStat title="Total dials" value={String(analytics.summary.totalDials)} />
        <MetricStat
          title="Total connected"
          value={String(analytics.summary.totalConnected)}
          detail={`${connectRate}% connect rate`}
        />
        <MetricStat
          title="Dialing time"
          value={formatAnalyticsDuration(analytics.summary.dialingSeconds)}
        />
        <MetricStat
          title="Connected on line"
          value={formatAnalyticsDuration(analytics.summary.connectedSeconds)}
        />
        <MetricStat
          title="Caller interface time"
          value={formatAnalyticsDuration(analytics.summary.interfaceSeconds)}
        />
        <MetricStat
          title="Shifts"
          value={String(analytics.summary.totalShifts)}
          detail={
            analytics.summary.totalShifts > 0
              ? `Avg ${formatAnalyticsDuration(avgShiftDuration)}`
              : undefined
          }
        />
      </div>

      {canFilterUsers && analytics.users.length > 0 ? (
        <Section variant="flat">
          <SectionHeader branded={false} compact title="By user" />
          <div className="overflow-x-auto">
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
          </div>
        </Section>
      ) : null}

      {canFilterUsers && analytics.shifts.length > 0 ? (
        <Section variant="flat">
          <SectionHeader branded={false} compact title="Shifts" />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>End</TableHead>
                  <TableHead>Dials</TableHead>
                  <TableHead>Connected</TableHead>
                  <TableHead>Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.shifts.map((row) => (
                  <TableRow
                    key={`${row.userId}-${row.shiftNumber}`}
                    className={row.userId === currentUserId ? "bg-muted/40" : undefined}
                  >
                    <TableCell className="font-medium">
                      {row.label}
                      {row.userId === currentUserId ? " (you)" : ""}
                    </TableCell>
                    <TableCell>{new Date(row.startTime).toLocaleString()}</TableCell>
                    <TableCell>{new Date(row.endTime).toLocaleString()}</TableCell>
                    <TableCell>{row.dials}</TableCell>
                    <TableCell>{row.connected}</TableCell>
                    <TableCell>{formatAnalyticsDuration(row.shiftSeconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      ) : null}
    </div>
  );
}
