import { Headset, Mail, MessageSquare, Phone } from "lucide-react";

type CampaignTypeIconProps = {
  type?: string | null;
  className?: string;
};

export function CampaignTypeIcon({
  type,
  className = "h-4 w-4",
}: CampaignTypeIconProps) {
  const Icon =
    type === "message"
      ? MessageSquare
      : type === "live_call"
        ? Headset
        : type === "email"
          ? Mail
          : Phone;

  return <Icon className={className} aria-hidden="true" />;
}
