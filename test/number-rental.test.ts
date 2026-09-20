import { describe, expect, test } from "vitest";
import {
  NUMBER_RENTAL_MONTHLY_CREDITS,
  hasCreditsForNumberRental,
  numberRentalConfirmCopy,
  numberRentalPriceLabel,
} from "@/lib/number-rental";

describe("number-rental", () => {
  test("price label and confirm copy reference monthly credits", () => {
    // Pinned literal (#1925): a change to NUMBER_RENTAL_MONTHLY_CREDITS must
    // fail these copy assertions, not move both sides in lockstep.
    expect(numberRentalPriceLabel()).toContain("100");
    expect(numberRentalConfirmCopy()).toContain("100");
  });

  test("hasCreditsForNumberRental compares balance to monthly credits", () => {
    expect(hasCreditsForNumberRental(NUMBER_RENTAL_MONTHLY_CREDITS)).toBe(true);
    expect(hasCreditsForNumberRental(NUMBER_RENTAL_MONTHLY_CREDITS - 1)).toBe(
      false,
    );
  });
});
