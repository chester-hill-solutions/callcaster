import { NavLink } from "react-router";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Heading } from "@/components/ui/typography";
import { Enums } from "@/lib/db-types";

type HeaderProps = {
  title: string;
  isDesktop: boolean;
  status: Enums<"campaign_status">;
};

const getStatusColor = (status: Enums<"campaign_status">) => {
  switch (status) {
    case "pending":
      return "bg-yellow-200 text-yellow-800";
    case "scheduled":
      return "bg-blue-200 text-blue-800";
    case "running":
      return "bg-green-200 text-green-800";
    case "complete":
      return "bg-teal-100 text-teal-800";
    case "paused":
      return "bg-orange-200 text-orange-800";
    case "draft":
      return "bg-gray-200 text-gray-800";
    default:
      return "bg-gray-200 text-gray-800";
  }
};

export const CampaignHeader = ({
  title,
  isDesktop = false,
  status,
}: HeaderProps) => {
  return (
    <div
      className={`mt-2 ${isDesktop ? "hidden sm:flex" : "flex sm:hidden"} justify-center gap-2 ${isDesktop ? "rounded-xl border border-border/80 bg-card/70 p-2" : ""}`}
    >
      <NavLink
        className={`${isDesktop ? "flex items-center gap-2" : ""} text-foreground hover:text-brand-primary`}
        to="."
        relative="path"
        end
      >
        {isDesktop && <Megaphone className="h-[18px] w-[18px]" />}
        <Heading as="h3" level={3} branded={false} className="inline">
          {title}
        </Heading>
        <Badge variant="outline" className={`ml-2 ${getStatusColor(status)}`}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </Badge>
      </NavLink>
    </div>
  );
};
