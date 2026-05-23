import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/typography";
import { numberRentalConfirmCopy } from "@/lib/number-rental";
import type { AvailableNumber } from "@/routes/workspaces+/$id/settings/numbers.route";
import { NavLink, type FetcherWithComponents } from "react-router";

import type { PurchaseFetcherData } from "./NumberPurchase";

type NumberPurchaseConfirmDialogProps = {
  selectedNumber: AvailableNumber | null;
  onClose: () => void;
  workspaceId: string;
  canAfford: boolean;
  billingLink: string;
  purchaseFetcher: FetcherWithComponents<PurchaseFetcherData>;
};

export function NumberPurchaseConfirmDialog({
  selectedNumber,
  onClose,
  workspaceId,
  canAfford,
  billingLink,
  purchaseFetcher,
}: NumberPurchaseConfirmDialogProps) {
  return (
    <Dialog
      open={selectedNumber !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="bg-card sm:max-w-md">
        {selectedNumber ? (
          <purchaseFetcher.Form method="POST" action="/api/numbers">
            <DialogHeader>
              <DialogTitle>Confirm purchase</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <Text>
                {selectedNumber.friendlyName} ({selectedNumber.phoneNumber})
              </Text>
              <Text variant="muted" className="text-sm">
                {numberRentalConfirmCopy()}
              </Text>
              <input
                type="hidden"
                name="phoneNumber"
                value={selectedNumber.phoneNumber}
                readOnly
              />
              <input type="hidden" name="workspace_id" value={workspaceId} />
              {purchaseFetcher.data?.creditsError ? (
                <Text className="text-sm text-destructive">
                  You do not have enough credits to purchase this number.
                </Text>
              ) : null}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <DialogClose asChild>
                <Button variant="outline" type="button">
                  Cancel
                </Button>
              </DialogClose>
              {purchaseFetcher.data?.creditsError ? (
                <Button asChild>
                  <NavLink to={billingLink} relative="path">
                    Buy credits
                  </NavLink>
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!canAfford || purchaseFetcher.state !== "idle"}
                >
                  {purchaseFetcher.state !== "idle" ? "Purchasing…" : "Purchase"}
                </Button>
              )}
            </DialogFooter>
          </purchaseFetcher.Form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
