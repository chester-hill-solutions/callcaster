export type WorkspaceAnalyticsRange = {
  from: string;
  to: string;
};

export type WorkspaceAnalyticsUserRow = {
  userId: string;
  label: string;
  totalDials: number;
  totalConnected: number;
  dialingSeconds: number;
  connectedSeconds: number;
  interfaceSeconds: number;
};

export type WorkspaceAnalyticsSummary = {
  totalDials: number;
  totalConnected: number;
  dialingSeconds: number;
  connectedSeconds: number;
  interfaceSeconds: number;
  totalShifts: number;
  totalShiftSeconds: number;
};

export type WorkspaceAnalyticsShiftRow = {
  shiftNumber: number;
  userId: string;
  label: string;
  startTime: string;
  endTime: string;
  dials: number;
  connected: number;
  shiftSeconds: number;
};

export type WorkspaceAnalyticsResult = {
  range: WorkspaceAnalyticsRange;
  summary: WorkspaceAnalyticsSummary;
  users: WorkspaceAnalyticsUserRow[];
  shifts: WorkspaceAnalyticsShiftRow[];
  scopedUserId: string | null;
};

const NON_CONNECT_DISPOSITIONS = new Set([
  "no-answer",
  "failed",
  "busy",
  "canceled",
  "cancelled",
  "voicemail",
  "voicemail-no-message",
  "undelivered",
]);

export function parseAnalyticsDateParam(
  value: string | null,
  fallback: Date,
): string {
  if (!value) {
    return fallback.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString();
  }
  return parsed.toISOString();
}

export function defaultAnalyticsRange(now = new Date()): WorkspaceAnalyticsRange {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function parseCallDurationSeconds(
  duration: string | number | null | undefined,
  callDuration: number | null | undefined,
): number {
  if (typeof callDuration === "number" && Number.isFinite(callDuration) && callDuration > 0) {
    return Math.round(callDuration);
  }
  if (duration == null || duration === "") return 0;
  const parsed = Number.parseInt(String(duration), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function secondsBetween(
  start: string | null | undefined,
  end: string | null | undefined,
): number {
  if (!start || !end) return 0;
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0;
  }
  return Math.round((endMs - startMs) / 1000);
}

export type AnalyticsAttemptInput = {
  id: number;
  user_id: string | null;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
  disposition: string | null;
  call: Array<{
    duration: string | null;
    call_duration: number | null;
    status: string | null;
    end_time: string | null;
  }> | null;
};

export function isConnectedAttempt(attempt: AnalyticsAttemptInput): boolean {
  if (attempt.answered_at) {
    return true;
  }

  const disposition = (attempt.disposition ?? "").toLowerCase();
  if (disposition && !NON_CONNECT_DISPOSITIONS.has(disposition)) {
    return true;
  }

  const calls = attempt.call ?? [];
  return calls.some((call) => {
    const seconds = parseCallDurationSeconds(call.duration, call.call_duration);
    return seconds >= 3 && (call.status ?? "").toLowerCase() === "completed";
  });
}

export function aggregateAttemptMetrics(attempt: AnalyticsAttemptInput): {
  dialingSeconds: number;
  connectedSeconds: number;
  interfaceSeconds: number;
  connected: boolean;
} {
  const calls = attempt.call ?? [];
  const connected = isConnectedAttempt(attempt);
  const connectedSeconds = calls.reduce(
    (total, call) =>
      total + parseCallDurationSeconds(call.duration, call.call_duration),
    0,
  );

  const answeredAt = attempt.answered_at;
  const endedAt =
    attempt.ended_at ??
    calls
      .map((call) => call.end_time)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ??
    null;

  const dialingSeconds = answeredAt
    ? secondsBetween(attempt.created_at, answeredAt)
    : secondsBetween(attempt.created_at, endedAt);

  const interfaceSeconds = secondsBetween(attempt.created_at, endedAt ?? answeredAt);

  return {
    dialingSeconds,
    connectedSeconds,
    interfaceSeconds: interfaceSeconds > 0 ? interfaceSeconds : dialingSeconds + connectedSeconds,
    connected,
  };
}

export function formatAnalyticsDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

const SHIFT_GRACE_SECONDS = 5 * 60; // 5 minutes

export function buildShifts(
  attempts: AnalyticsAttemptInput[],
  userLabels: Map<string, string>,
): WorkspaceAnalyticsShiftRow[] {
  const byUser = new Map<string, AnalyticsAttemptInput[]>();
  for (const attempt of attempts) {
    if (!attempt.user_id) continue;
    const list = byUser.get(attempt.user_id) ?? [];
    list.push(attempt);
    byUser.set(attempt.user_id, list);
  }

  const shifts: WorkspaceAnalyticsShiftRow[] = [];

  for (const [userId, userAttempts] of byUser) {
    const sorted = [...userAttempts].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    let currentShift: {
      startTime: Date;
      endTime: Date;
      dials: number;
      connected: number;
    } | null = null;
    let shiftNumber = 0;

    for (const attempt of sorted) {
      const metrics = aggregateAttemptMetrics(attempt);
      const attemptStart = new Date(attempt.created_at);
      const attemptEnd = attempt.ended_at
        ? new Date(attempt.ended_at)
        : new Date(attemptStart.getTime() + metrics.interfaceSeconds * 1000);

      if (
        !currentShift ||
        attemptStart.getTime() > currentShift.endTime.getTime() + SHIFT_GRACE_SECONDS * 1000
      ) {
        if (currentShift) {
          shiftNumber += 1;
          shifts.push({
            shiftNumber,
            userId,
            label: userLabels.get(userId) ?? userId,
            startTime: currentShift.startTime.toISOString(),
            endTime: currentShift.endTime.toISOString(),
            dials: currentShift.dials,
            connected: currentShift.connected,
            shiftSeconds: Math.round(
              (currentShift.endTime.getTime() - currentShift.startTime.getTime()) / 1000,
            ),
          });
        }
        currentShift = {
          startTime: attemptStart,
          endTime: attemptEnd,
          dials: 1,
          connected: metrics.connected ? 1 : 0,
        };
      } else {
        currentShift.endTime =
          attemptEnd > currentShift.endTime ? attemptEnd : currentShift.endTime;
        currentShift.dials += 1;
        if (metrics.connected) currentShift.connected += 1;
      }
    }

    if (currentShift) {
      shiftNumber += 1;
      shifts.push({
        shiftNumber,
        userId,
        label: userLabels.get(userId) ?? userId,
        startTime: currentShift.startTime.toISOString(),
        endTime: currentShift.endTime.toISOString(),
        dials: currentShift.dials,
        connected: currentShift.connected,
        shiftSeconds: Math.round(
          (currentShift.endTime.getTime() - currentShift.startTime.getTime()) / 1000,
        ),
      });
    }
  }

  return shifts.sort(
    (a, b) =>
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime() ||
      a.userId.localeCompare(b.userId),
  );
}

export function buildWorkspaceAnalytics(args: {
  attempts: AnalyticsAttemptInput[];
  users: Array<{ id: string; label: string }>;
  range: WorkspaceAnalyticsRange;
  scopedUserId: string | null;
}): WorkspaceAnalyticsResult {
  const perUser = new Map<string, WorkspaceAnalyticsUserRow>();
  const userLabels = new Map<string, string>();

  for (const user of args.users) {
    perUser.set(user.id, {
      userId: user.id,
      label: user.label,
      totalDials: 0,
      totalConnected: 0,
      dialingSeconds: 0,
      connectedSeconds: 0,
      interfaceSeconds: 0,
    });
    userLabels.set(user.id, user.label);
  }

  const summary: WorkspaceAnalyticsSummary = {
    totalDials: 0,
    totalConnected: 0,
    dialingSeconds: 0,
    connectedSeconds: 0,
    interfaceSeconds: 0,
    totalShifts: 0,
    totalShiftSeconds: 0,
  };

  for (const attempt of args.attempts) {
    if (!attempt.user_id) continue;
    const metrics = aggregateAttemptMetrics(attempt);
    summary.totalDials += 1;
    if (metrics.connected) summary.totalConnected += 1;
    summary.dialingSeconds += metrics.dialingSeconds;
    summary.connectedSeconds += metrics.connectedSeconds;
    summary.interfaceSeconds += metrics.interfaceSeconds;

    const existing = perUser.get(attempt.user_id) ?? {
      userId: attempt.user_id,
      label: attempt.user_id,
      totalDials: 0,
      totalConnected: 0,
      dialingSeconds: 0,
      connectedSeconds: 0,
      interfaceSeconds: 0,
    };
    existing.totalDials += 1;
    if (metrics.connected) existing.totalConnected += 1;
    existing.dialingSeconds += metrics.dialingSeconds;
    existing.connectedSeconds += metrics.connectedSeconds;
    existing.interfaceSeconds += metrics.interfaceSeconds;
    perUser.set(attempt.user_id, existing);
  }

  const users = [...perUser.values()]
    .filter((row) => row.totalDials > 0)
    .sort((left, right) => right.totalDials - left.totalDials);

  const shifts = buildShifts(args.attempts, userLabels);
  summary.totalShifts = shifts.length;
  summary.totalShiftSeconds = shifts.reduce((sum, s) => sum + s.shiftSeconds, 0);

  return {
    range: args.range,
    summary,
    users,
    shifts,
    scopedUserId: args.scopedUserId,
  };
}
