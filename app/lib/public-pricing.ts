import {
  CREDIT_PRICE_CAD,
  IVR_ADDITIONAL_MINUTE_CREDITS,
  IVR_FIRST_MINUTE_CREDITS,
  MIN_CREDITS,
  MIN_PURCHASE_CAD,
  MMS_CREDITS,
  NUMBER_RENTAL_MONTHLY_CREDITS,
  SMS_SEGMENT_CREDITS,
  STAFFED_ADDITIONAL_MINUTE_CREDITS,
  STAFFED_FIRST_MINUTE_CREDITS,
  formatCadFromCredits,
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

export function buildPublicPricingRows(): PublicPricingRow[] {
  const segmentPrice = formatCadFromCredits(SMS_SEGMENT_CREDITS);
  const mmsPrice = formatCadFromCredits(MMS_CREDITS);
  const ivrDial = formatCadFromCredits(IVR_FIRST_MINUTE_CREDITS);
  const ivrMinute = formatCadFromCredits(IVR_ADDITIONAL_MINUTE_CREDITS);
  const staffedDial = formatCadFromCredits(STAFFED_FIRST_MINUTE_CREDITS);
  const staffedMinute = formatCadFromCredits(STAFFED_ADDITIONAL_MINUTE_CREDITS);
  const numberRental = formatCadFromCredits(NUMBER_RENTAL_MONTHLY_CREDITS);
  const minPurchase = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(MIN_PURCHASE_CAD);

  return [
    {
      service: "Credits",
      type: "Prepaid balance",
      rates: [
        {
          name: "Credit price",
          price: `${formatCadFromCredits(1)} / credit`,
          description: `All usage is billed in credits at $${CREDIT_PRICE_CAD.toFixed(2)} CAD each. Minimum purchase is ${MIN_CREDITS.toLocaleString()} credits (${minPurchase}).`,
        },
      ],
    },
    {
      service: "Texting",
      type: "SMS & MMS",
      rates: [
        {
          name: "SMS segment",
          price: `${segmentPrice} / segment`,
          description:
            "Outbound SMS is billed per segment. Long messages that span multiple segments are charged accordingly.",
        },
        {
          name: "MMS",
          price: `${mmsPrice} / message`,
          description: "Media messages (MMS) are billed at the MMS rate.",
        },
      ],
    },
    {
      service: "Calling",
      type: "IVR & auto-dial",
      rates: [
        {
          name: "First minute",
          price: `${ivrDial} / dial`,
          description: "Covers the first minute of each outbound IVR or auto-dial attempt.",
        },
        {
          name: "Additional minutes",
          price: `${ivrMinute} / minute`,
          description: "Applies to each additional minute after the first.",
        },
      ],
    },
    {
      service: "Staffed live calls",
      type: "Agent-connected dialing",
      rates: [
        {
          name: "First minute",
          price: `${staffedDial} / dial`,
          description: "Covers the first minute of each staffed live call attempt.",
        },
        {
          name: "Additional minutes",
          price: `${staffedMinute} / minute`,
          description: "Applies to each additional minute after the first.",
        },
      ],
    },
    {
      service: "Phone numbers",
      type: "Monthly rental",
      rates: [
        {
          name: "Rented number",
          price: `${numberRental} / month`,
          description: "Each rented phone number renews monthly from the rental anchor date.",
        },
      ],
    },
  ];
}
