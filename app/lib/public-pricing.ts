import {
  CREDIT_PRICE_CAD,
  IVR_ADDITIONAL_MINUTE_CREDITS,
  IVR_FIRST_MINUTE_CREDITS,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
  formatCreditLabel,
} from "../../shared/pricing";

export type PublicPricingRate = {
  name: string;
  price: string;
  description: string;
};

export type PublicPricingRow = {
  service: string;
  type: string;
  rates: PublicPricingRate[];
};

export type PublicPricingContent = {
  /** Three main service cards laid out side-by-side (#1392). */
  services: PublicPricingRow[];
  /** Underlying account costs — the price of credits and phone rental. */
  account: PublicPricingRow[];
  /**
   * Staffed live calls no longer list a rate on the public page; users are
   * invited to reach out so we can scope the engagement. #1392.
   */
  staffedCallout: {
    heading: string;
    body: string;
    contactEmail: string;
  };
};

export function buildPublicPricingContent(): PublicPricingContent {
  const segmentCredits = formatCreditLabel(SMS_SEGMENT_CREDITS);
  const mmsCredits = formatCreditLabel(MMS_CREDITS);
  const ivrFirstCredits = formatCreditLabel(IVR_FIRST_MINUTE_CREDITS);
  // The additional-minute rate is often referenced as e.g. "3 credits" — the
  // label helper adds the noun so the display line reads naturally.
  const ivrPerMinuteCredits = formatCreditLabel(IVR_ADDITIONAL_MINUTE_CREDITS);
  const numberRentalCredits = formatCreditLabel(NUMBER_RENTAL_MONTHLY_CREDITS);
  const minPurchase = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(MIN_PURCHASE_CAD);

  const services: PublicPricingRow[] = [
    {
      service: "Texting",
      type: "SMS & MMS",
      rates: [
        {
          name: "SMS segment",
          price: `${segmentCredits} / segment`,
          description:
            "Outbound SMS is billed per segment. Long messages spanning multiple segments are billed for each.",
        },
        {
          name: "MMS",
          price: `${mmsCredits} / message`,
          description: "Media messages (MMS) are billed at the MMS rate.",
        },
      ],
    },
    {
      service: "Calling",
      type: "Agent-driven auto-dial",
      rates: [
        {
          name: "First minute",
          price: `${ivrFirstCredits} / dial`,
          description: "Covers the first minute of each outbound auto-dial attempt.",
        },
        {
          name: "Additional minutes",
          price: `${ivrPerMinuteCredits} / minute`,
          description: "Applies to each additional minute after the first.",
        },
      ],
    },
    {
      service: "IVRs",
      type: "Interactive voice response",
      rates: [
        {
          name: "First minute",
          price: `${ivrFirstCredits} / dial`,
          description: "Covers the first minute of each outbound IVR call.",
        },
        {
          name: "Additional minutes",
          price: `${ivrPerMinuteCredits} / minute`,
          description: "Applies to each additional minute after the first.",
        },
      ],
    },
  ];

  const account: PublicPricingRow[] = [
    {
      service: "Credits",
      type: "Prepaid balance",
      rates: [
        {
          name: "Credit price",
          price: `$${CREDIT_PRICE_CAD.toFixed(2)} CAD / credit`,
          description: `All usage above is billed in credits. Minimum purchase is ${MIN_CREDITS.toLocaleString()} credits (${minPurchase}).`,
        },
      ],
    },
    {
      service: "Phone numbers",
      type: "Monthly rental",
      rates: [
        {
          name: "Rented number",
          price: `${numberRentalCredits} / month`,
          description: "Each rented phone number renews monthly from the rental anchor date.",
        },
      ],
    },
  ];

  return {
    services,
    account,
    staffedCallout: {
      heading: "Staffed live calls",
      body:
        "Need our team to place the calls for you? Staffed engagements are quoted per project so we can match agent count, hours, and script complexity to what you need.",
      contactEmail: "info@callcaster.ca",
    },
  };
}

/**
 * @deprecated Kept for compatibility; new callers should use
 * {@link buildPublicPricingContent} which returns the three-lane layout
 * (services, account, staffedCallout) the pricing page renders after #1392.
 */
export function buildPublicPricingRows(): PublicPricingRow[] {
  const { services, account } = buildPublicPricingContent();
  return [...services, ...account];
}
