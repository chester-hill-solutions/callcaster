import type { SimSmsTaskInput } from "./task-context";

const APPROVED_RECIPIENT = {
  recipientName: "Saihaan Syed",
  recipientPhone: "+16478657844",
} as const;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the sim suite.`);
  return value;
}

function exact(name: string, expected: string): string {
  const value = required(name);
  if (value !== expected) {
    throw new Error(`${name} must match the approved SIM recipient.`);
  }
  return value;
}

/** Temporary #2812 adapter. Remove when the shared SIM project-config input exists. */
export function loadSimSmsCompatibilityInput(): SimSmsTaskInput {
  return {
    recipient: {
      name: exact("SIM_RECIPIENT_NAME", APPROVED_RECIPIENT.recipientName),
      phone: exact("SIM_RECIPIENT_PHONE", APPROVED_RECIPIENT.recipientPhone),
    },
    message: process.env.SIM_SMS_MESSAGE?.trim() || "CallCaster SIM SMS check",
    stripe: {
      cardNumber: "4242424242424242",
      expiry: "12/34",
      cvc: "123",
    },
  };
}
