import { Button } from "@/components/ui/button";
import {
  getCampaignPlaceNav,
  type CampaignSetupFlowPlace,
} from "@/lib/campaign-status-rail";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink, useParams } from "react-router";

/**
 * Footer Back/Next across Setup → Content → Queue → Launch (and Results after Launch).
 */
export function CampaignPlaceNav({
  current,
}: {
  current: CampaignSetupFlowPlace;
}) {
  const { id: workspaceId, selected_id: campaignId } = useParams();
  if (!workspaceId || !campaignId) {
    return null;
  }

  const { back, next } = getCampaignPlaceNav(workspaceId, campaignId, current);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-6"
      aria-label="Campaign place navigation"
      data-testid="campaign-place-nav"
    >
      {back ? (
        <Button variant="outline" asChild>
          <NavLink
            to={back.href}
            className="inline-flex items-center gap-1.5"
            data-testid="campaign-place-nav-back"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {back.label}
          </NavLink>
        </Button>
      ) : (
        <span />
      )}
      {next ? (
        <Button variant="default" asChild>
          <NavLink
            to={next.href}
            className="inline-flex items-center gap-1.5"
            data-testid="campaign-place-nav-next"
          >
            {next.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </NavLink>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
