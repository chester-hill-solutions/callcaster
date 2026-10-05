import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { getCampaignSendWindowWarning } from "@/lib/campaign-readiness";
import type { Campaign } from "@/lib/types";

/** Persistent domain notice through the single root shad-cc feedback host. */
export function CampaignSendWindowNotice({
  campaign,
  canEdit,
}: {
  campaign: Campaign | null | undefined;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const warning = getCampaignSendWindowWarning(campaign);
  const message = warning?.message;
  const campaignId = campaign?.id;
  const workspaceId = campaign?.workspace;
  const identity = campaignId != null && workspaceId ? `${workspaceId}:${campaignId}` : null;
  const toastId = useRef<string | number | null>(null);

  /**
   * @effect Remove the campaign notice when its page identity changes or unmounts.
   * @effect-deps identity identifies the campaign whose notice this page owns.
   * @effect-side-effects dom: dismiss the notice through the root feedback host.
   * @effect-why-not-loader The shared feedback host is a browser subscription.
   */
  useEffect(() => {
    return () => {
      if (toastId.current != null) toast.dismiss(toastId.current);
      toastId.current = null;
    };
  }, [identity]);

  /**
   * @effect Keep the persistent SMS warning aligned with the saved campaign window.
   * @effect-deps identity and message choose the notice; workspaceId, campaignId, canEdit and navigate choose its remedy.
   * @effect-side-effects dom: update or dismiss a notice after the root host subscribes.
   * @effect-why-not-loader Sonner renders through the existing browser feedback host.
   */
  useEffect(() => {
    if (!identity || workspaceId == null || campaignId == null) return;
    if (!message) {
      if (toastId.current != null) toast.dismiss(toastId.current);
      toastId.current = null;
      return;
    }
    let active = true;
    // The root Toaster subscribes in its effect. Direct page loads can mount
    // this notice first; wait until all mount effects have subscribed.
    queueMicrotask(() => {
      if (!active) return;
      toastId.current = toast.warning("Unrestricted SMS sending", {
        id: toastId.current ?? undefined,
        description: message,
        duration: Infinity,
        closeButton: true,
        action: canEdit ? {
          label: "Edit send window",
          onClick: () => navigate(`/workspaces/${encodeURIComponent(workspaceId)}/campaigns/${campaignId}/settings`),
        } : undefined,
      });
    });
    return () => { active = false; };
  }, [identity, message, workspaceId, campaignId, canEdit, navigate]);

  return null;
}
