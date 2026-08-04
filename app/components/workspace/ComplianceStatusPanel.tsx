import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Section, SectionHeader } from "@/components/shared/Section";
import type { WorkspaceMessagingOnboardingState } from "@/lib/types";

function statusLabel(status: string): string {
  switch (status) {
    case "approved":
    case "live":
      return "Approved";
    case "in_review":
    case "submitting":
      return "In review";
    case "rejected":
      return "Rejected";
    case "collecting_business":
    case "provisioning":
      return "Needs info";
    case "not_started":
      return "Draft";
    default:
      return status.replaceAll("_", " ");
  }
}

type ComplianceStatusPanelProps = {
  workspaceId: string;
  onboarding: WorkspaceMessagingOnboardingState;
  a2pBlockingIssues?: string[];
};

/**
 * Trust Hub-style status surface for post-intake workspaces. Does not freeze
 * navigation — shows what is blocked and where to continue.
 */
export function ComplianceStatusPanel({
  workspaceId,
  onboarding,
  a2pBlockingIssues = [],
}: ComplianceStatusPanelProps) {
  const channels = onboarding.selectedChannels;
  const showA2p = channels.includes("a2p10dlc");
  const showTollFree = channels.includes("toll_free_bulk_sms");
  const showVoice = channels.includes("voice_compliance") || channels.includes("local_number");

  if (!showA2p && !showTollFree && !showVoice) {
    return null;
  }

  const rows: Array<{ label: string; status: string; detail?: string | null }> =
    [];

  if (showVoice) {
    rows.push({
      label: "Emergency voice address",
      status: onboarding.emergencyVoice.address.status,
      detail: onboarding.emergencyVoice.address.validationError,
    });
  }
  if (showTollFree) {
    rows.push({
      label: "Toll-free verification",
      status: onboarding.status,
      detail: onboarding.reviewState.lastError,
    });
  }
  if (showA2p) {
    rows.push({
      label: "A2P 10DLC",
      status: onboarding.a2p10dlc.status,
      detail:
        onboarding.a2p10dlc.rejectionReason ?? onboarding.reviewState.lastError,
    });
  }

  return (
    <Section variant="flat" data-testid="compliance-status-panel">
      <SectionHeader
        compact
        title="Compliance status"
        description="Registration and verification progress for the channels this workspace uses."
      />
      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.label}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2"
          >
            <span className="text-sm font-medium">{row.label}</span>
            <Badge variant="outline">{statusLabel(row.status)}</Badge>
            {row.detail ? (
              <p className="w-full text-sm text-muted-foreground">{row.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {a2pBlockingIssues.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {a2pBlockingIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to={`/workspaces/${workspaceId}/settings/numbers`}>
            Numbers & address
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`/workspaces/${workspaceId}/settings`}>Workspace settings</Link>
        </Button>
      </div>
    </Section>
  );
}
