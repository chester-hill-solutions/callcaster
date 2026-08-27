import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ChatOptOutBannerProps = {
  contactPhone?: string;
  optedOut: boolean;
};

export function ChatOptOutBanner({ contactPhone, optedOut }: ChatOptOutBannerProps) {
  if (!optedOut) {
    return null;
  }

  return (
    <Alert variant="warning" role="status" className="rounded-none border-x-0 border-t-0">
      <AlertTriangle className="h-4 w-4" aria-hidden />
      <AlertTitle>This contact has opted out</AlertTitle>
      <AlertDescription>
        {contactPhone
          ? `${contactPhone} replied with an opt-out keyword or is marked as opted out.`
          : "This contact replied with an opt-out keyword or is marked as opted out."}{" "}
        Do not send further messages unless they opt back in.
      </AlertDescription>
    </Alert>
  );
}
