import { Link } from "react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  hasCreditsForNumberRental,
  NUMBER_RENTAL_MONTHLY_CREDITS,
} from "@/lib/number-rental";

type NumberRentalCreditsAlertProps = {
  creditsBalance: number;
  billingLink: string;
  title?: string;
  showWhenSufficient?: boolean;
};

export function NumberRentalCreditsAlert({
  creditsBalance,
  billingLink,
  title = "Credits for number rental",
  showWhenSufficient = false,
}: NumberRentalCreditsAlertProps) {
  const canAfford = hasCreditsForNumberRental(creditsBalance);

  if (canAfford && !showWhenSufficient) {
    return null;
  }

  return (
    <Alert variant={canAfford ? "default" : "destructive"}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Balance: <strong>{creditsBalance.toLocaleString()}</strong> credits · Rent:{" "}
          <strong>{NUMBER_RENTAL_MONTHLY_CREDITS.toLocaleString()}</strong> credits per 30-day
          period
          {canAfford ? " — you have enough to rent a number." : " — add credits before renting."}
        </span>
        {!canAfford ? (
          <Button size="sm" variant="outline" asChild>
            <Link to={billingLink}>Buy credits</Link>
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
