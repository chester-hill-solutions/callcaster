import { z } from "zod";
import {
  CREDIT_PRICE_CAD,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
} from "../../../../shared/pricing";

export const billingPricingSchema = z.object({
  credit_price_cad: z.literal(CREDIT_PRICE_CAD),
  min_credits: z.literal(MIN_CREDITS),
  min_purchase_cad: z.literal(MIN_PURCHASE_CAD),
});

export const checkoutSessionBodySchema = z.object({
  amount: z
    .number()
    .int()
    .min(
      MIN_CREDITS,
      `Choose at least ${MIN_CREDITS} credits (${MIN_PURCHASE_CAD} CAD minimum).`,
    ),
});

export type CheckoutSessionBody = z.infer<typeof checkoutSessionBodySchema>;
export type BillingPricing = z.infer<typeof billingPricingSchema>;
