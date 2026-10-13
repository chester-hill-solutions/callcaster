const SAI_LOCAL = {
  workspaceId: "7e0aa760-7bdf-497c-aa4d-91ff2104db78",
  workspaceKey: "sai_local",
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
    throw new Error(`${name} must be ${expected} for the sai-local sim profile.`);
  }
  return value;
}

export type SimSmsConfig = {
  sender: { email: string; password: string };
  workspace: { id: string; key: string };
  recipient: { name: string; phone: string };
  message: string;
  stripe: { cardNumber: string; expiry: string; cvc: string };
};

export function loadSaiLocalSmsConfig(): SimSmsConfig {
  return {
    sender: {
      email: required("SIM_SENDER_EMAIL"),
      password: required("SIM_SENDER_PASSWORD"),
    },
    workspace: {
      id: SAI_LOCAL.workspaceId,
      key: SAI_LOCAL.workspaceKey,
    },
    recipient: {
      name: exact("SIM_RECIPIENT_NAME", SAI_LOCAL.recipientName),
      phone: exact("SIM_RECIPIENT_PHONE", SAI_LOCAL.recipientPhone),
    },
    message: process.env.SIM_SMS_MESSAGE?.trim() || "CallCaster SIM SMS check",
    stripe: {
      cardNumber: "4242424242424242",
      expiry: "12/34",
      cvc: "123",
    },
  };
}
