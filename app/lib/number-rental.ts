export { NUMBER_RENTAL_MONTHLY_CREDITS } from "../../shared/pricing";

import { NUMBER_RENTAL_MONTHLY_CREDITS } from "../../shared/pricing";

export function numberRentalPriceLabel(): string {
  return `${NUMBER_RENTAL_MONTHLY_CREDITS} credits/month`;
}

export function numberRentalConfirmCopy(): string {
  return `The price of this number is ${NUMBER_RENTAL_MONTHLY_CREDITS} credits per 30-day rental period. Billing is monthly from the purchase date. You may release the number at any time; see number rental billing for renewal and grace-period details.`;
}

export function hasCreditsForNumberRental(balance: number): boolean {
  return balance >= NUMBER_RENTAL_MONTHLY_CREDITS;
}
