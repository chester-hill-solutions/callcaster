import { describe, expect, test } from "vitest";
import {
  NUMBER_RENTAL_MONTHLY_CREDITS,
  hasCreditsForNumberRental,
  numberRentalConfirmCopy,
  numberRentalPriceLabel,
} from "@/lib/number-rental";

describe("number-rental", () => {
  test("price label and confirm copy reference monthly credits", () => {
    expect(numberRentalPriceLabel()).toContain(String(NUMBER_RENTAL_MONTHLY_CREDITS));
    expect(numberRentalConfirmCopy()).toContain(String(NUMBER_RENTAL_MONTHLY_CREDITS));
  });

  test("hasCreditsForNumberRental compares balance to monthly credits", () => {
    expect(hasCreditsForNumberRental(NUMBER_RENTAL_MONTHLY_CREDITS)).toBe(true);
    expect(hasCreditsForNumberRental(NUMBER_RENTAL_MONTHLY_CREDITS - 1)).toBe(
      false,
    );
  });
});
