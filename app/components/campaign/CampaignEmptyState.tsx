import { NavLink, useLocation } from "react-router";
import BgImage from "@/components/shared/TransparentBGImage";
import { Button } from "@/components/ui/button";
import { WorkspaceResourceEmptyState } from "@/components/workspace/WorkspaceResourceListShell";

const CampaignEmptyState = ({
  hasAccess = false,
  type,
}: {
  hasAccess: boolean;
  type: "number" | "campaign";
}) => {
  const loc = useLocation();
  const isCampaignsRoute = loc?.pathname?.split("/").pop() === "campaigns";

  const description =
    type === "campaign"
      ? hasAccess
        ? "Select an available campaign, or add a new one to get started."
        : "Select an available campaign or contact your admin team to get set up."
      : "Start by renting a number. After you create your first campaign, we'll walk you through script, queue, and launch setup step by step.";

  const action =
    hasAccess &&
    (type === "campaign" ? (
      <Button asChild>
        <NavLink to={isCampaignsRoute ? "new" : "campaigns/new"}>
          Add Campaign
        </NavLink>
      </Button>
    ) : (
      <Button asChild>
        <NavLink
          to={
            isCampaignsRoute
              ? "../settings/numbers/purchase"
              : "./settings/numbers/purchase"
          }
        >
          Get a Number
        </NavLink>
      </Button>
    ));

  return (
    <BgImage
      opacity={0.1}
      image="/Hero-1.png"
      className="flex h-full w-full flex-auto"
    >
      <div
        className="relative flex h-full flex-1 items-center justify-center pb-40"
        style={{ zIndex: 3 }}
      >
        <WorkspaceResourceEmptyState
          emptyMessage="Get started"
          emptyDescription={description}
          addAction={action || undefined}
        />
      </div>
    </BgImage>
  );
};

export default CampaignEmptyState;
