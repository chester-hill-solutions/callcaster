import { normalizeProviderStatus, type CallStatusEnum } from "@/lib/call-status";
import { useCallStatusPolling } from "@/hooks/call/useCallStatusPolling";
import { useWorkspaceEventSubscription } from "@/hooks/realtime/useWorkspaceEventSubscription";

/** Status sources report only to the canonical campaign customer owner. */
export function useCustomerCallEvents({ workspaceId, pollingTargetSid, pollingEnabled, agentLegSid, customerLegSid, sourceSid, onStatus }: {
  workspaceId: string; pollingTargetSid: string | null; pollingEnabled: boolean; agentLegSid: string | null;
  customerLegSid: string | null; sourceSid: string | null; onStatus: (sid: string, status: CallStatusEnum) => void;
}) {
  useCallStatusPolling({ callSid: pollingTargetSid, workspaceId, enabled: pollingEnabled, intervalMs: 5000, agentLegSid,
    onStatus: (status, resolvedSid) => {
      if (!pollingEnabled) return;
      const normalized = normalizeProviderStatus(status), sid = resolvedSid ?? pollingTargetSid;
      if (normalized && sid) onStatus(sid, normalized);
    },
  });
  useWorkspaceEventSubscription({ workspaceId, table: "call", filter: `workspace=eq.${workspaceId}`,
    onChange: payload => {
      const row = payload.new as { sid?: string; parent_call_sid?: string; status?: string } | null;
      if (!row?.sid || !row.status) return;
      if (customerLegSid !== null) {
        if (row.sid !== customerLegSid) return;
      } else {
        const direct = sourceSid !== agentLegSid && row.sid === sourceSid;
        const child = sourceSid !== null && sourceSid === agentLegSid && row.parent_call_sid === sourceSid;
        if (!direct && !child) return;
      }
      const normalized = normalizeProviderStatus(row.status);
      if (normalized) onStatus(row.sid, normalized);
    },
  });
}
