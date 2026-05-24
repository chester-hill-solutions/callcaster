export const CREDIT_PRICE_CAD = 0.003;
export const MIN_PURCHASE_CAD = 0.5;
export const MIN_CREDITS = Math.ceil(MIN_PURCHASE_CAD / CREDIT_PRICE_CAD);

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
  return "$0.003 CAD";
}
