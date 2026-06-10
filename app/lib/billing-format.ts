export {
  CREDIT_PRICE_CAD,
  MIN_PURCHASE_CAD,
  MIN_CREDITS,
} from "../../shared/pricing";

import { CREDIT_PRICE_CAD } from "../../shared/pricing";

export function formatCredits(amount: number) {
  return amount.toLocaleString();
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

export function formatUnitPrice() {
  return "$0.02 CAD";
}
