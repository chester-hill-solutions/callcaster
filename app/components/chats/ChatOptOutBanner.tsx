import { AlertTriangle } from "lucide-react";

type ChatOptOutBannerProps = {
  contactPhone?: string;
  optedOut: boolean;
};

export function ChatOptOutBanner({ contactPhone, optedOut }: ChatOptOutBannerProps) {
  if (!optedOut) {
    return null;
  }

  return (
    <div
      role="status"
      className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div>
          <p className="font-medium">This contact has opted out</p>
          <p className="mt-1 text-muted-foreground">
            {contactPhone
              ? `${contactPhone} replied with an opt-out keyword or is marked as opted out.`
              : "This contact replied with an opt-out keyword or is marked as opted out."}
            {" "}
            Do not send further messages unless they opt back in.
          </p>
        </div>
      </div>
    </div>
  );
}
