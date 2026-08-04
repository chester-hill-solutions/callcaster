import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = NonNullable<BadgeProps["variant"]>;

/**
 * Central mapping from app status vocabularies to Badge variants.
 *
 * Covers campaign statuses (draft/scheduled/running/active/paused/complete/
 * completed/archived), upload & job statuses (pending/processing/succeeded/
 * failed/error), call & queue statuses (queued/dequeued/ringing/in-progress/
 * busy/no-answer/voicemail), and message statuses (sending/sent/delivered/
 * received/undelivered).
 *
 * Rough semantics:
 * - success      → finished happily or healthy (complete, delivered, active,
 *                  running…). Note: "running" is success, not secondary — a
 *                  running campaign is the healthy/live state.
 * - secondary    → in flight (processing, queued, scheduled…)
 * - warning      → needs attention or waiting on someone (pending, paused…)
 * - destructive  → failed or terminal-bad (failed, error, cancelled…)
 * - outline      → neutral / inert (draft, archived, unknown…)
 */
export const statusToVariant: Record<string, StatusVariant> = {
  // Success-ish / healthy
  complete: "success",
  completed: "success",
  succeeded: "success",
  success: "success",
  active: "success",
  running: "success",
  delivered: "success",
  received: "success",
  sent: "success",
  verified: "success",

  // In progress
  processing: "secondary",
  "in-progress": "secondary",
  in_progress: "secondary",
  sending: "secondary",
  queued: "secondary",
  dequeued: "secondary",
  initiated: "secondary",
  ringing: "secondary",
  scheduled: "secondary",
  voicemail: "secondary",

  // Waiting / needs attention
  pending: "warning",
  paused: "warning",
  busy: "warning",
  "no-answer": "warning",
  no_answer: "warning",

  // Failed / terminal-bad
  failed: "destructive",
  error: "destructive",
  cancelled: "destructive",
  canceled: "destructive",
  undelivered: "destructive",
  expired: "destructive",

  // Neutral / inert
  draft: "outline",
  archived: "outline",
  inactive: "outline",
  stopped: "outline",
  unknown: "outline",
};

/** "no_answer" → "No answer", "in-progress" → "In progress". */
export function formatStatusLabel(status: string): string {
  const cleaned = status.replace(/[_-]+/g, " ").trim();
  if (!cleaned) return "Unknown";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

export type StatusBadgeProps = {
  status: string;
  /** Override the auto-formatted label. */
  label?: string;
  className?: string;
};

/**
 * Renders any app status string as a consistently colored Badge.
 * Unrecognized statuses fall back to the neutral "outline" variant.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const variant = statusToVariant[status.toLowerCase()] ?? "outline";

  return (
    <Badge variant={variant} className={cn("shrink-0", className)}>
      {label ?? formatStatusLabel(status)}
    </Badge>
  );
}
