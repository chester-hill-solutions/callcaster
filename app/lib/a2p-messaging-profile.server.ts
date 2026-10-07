import { z } from "zod";
import {
  parseA2pCompanyType,
  parseA2pStockExchange,
} from "@/lib/a2p-messaging-profile";
import { isObject } from "@/lib/type-safety-utils";
import type { WorkspaceMessagingBusinessProfile } from "@/lib/types";

const brandEmail = z.string().trim().email();

export function validatePostedA2pProfileFields(form: FormData): string | null {
  const company = form.get("a2pCompanyType");
  if (
    form.has("a2pCompanyType") &&
    company !== "" &&
    !parseA2pCompanyType(company)
  ) {
    return "Choose a valid A2P company type.";
  }
  const exchange = form.get("a2pStockExchange");
  if (
    form.has("a2pStockExchange") &&
    exchange !== "" &&
    !parseA2pStockExchange(exchange)
  ) {
    return "Choose a valid public company stock exchange.";
  }
  const email = form.get("a2pBrandContactEmail");
  if (
    form.has("a2pBrandContactEmail") &&
    email !== "" &&
    !brandEmail.safeParse(email).success
  ) {
    return "Enter a valid public brand representative organization email.";
  }
  if (
    form.has("a2pStockTicker") &&
    typeof form.get("a2pStockTicker") !== "string"
  ) {
    return "Enter the public company stock ticker as text.";
  }
  return null;
}

export function getA2pMessagingProfileAttributes(
  profile: WorkspaceMessagingBusinessProfile,
):
  | { ok: true; attributes: Record<string, string> }
  | { ok: false; issues: string[] } {
  const company = parseA2pCompanyType(profile.a2pCompanyType);
  if (!company)
    return {
      ok: false,
      issues: ["Choose the A2P company type in Business identity."],
    };
  if (company !== "public")
    return { ok: true, attributes: { company_type: company } };

  const exchange = parseA2pStockExchange(profile.a2pStockExchange);
  const ticker = profile.a2pStockTicker.trim();
  const email = brandEmail.safeParse(profile.a2pBrandContactEmail);
  const issues: string[] = [];
  if (!exchange) issues.push("Choose the public company stock exchange.");
  if (!ticker) issues.push("Add the public company stock ticker.");
  if (!email.success)
    issues.push("Add a valid public brand representative organization email.");
  if (issues.length || !exchange || !email.success)
    return { ok: false, issues };
  return {
    ok: true,
    attributes: {
      company_type: company,
      stock_exchange: exchange,
      stock_ticker: ticker,
      brand_contact_email: email.data,
    },
  };
}

export function validateProviderA2pProfileAttributes(
  attributes: unknown,
): boolean {
  if (!isObject(attributes)) return false;
  const company = parseA2pCompanyType(attributes.company_type);
  if (!company) return false;
  if (company !== "public") {
    return (
      attributes.stock_exchange === undefined &&
      attributes.stock_ticker === undefined
    );
  }
  return (
    Boolean(parseA2pStockExchange(attributes.stock_exchange)) &&
    typeof attributes.stock_ticker === "string" &&
    Boolean(attributes.stock_ticker.trim()) &&
    brandEmail.safeParse(attributes.brand_contact_email).success
  );
}

export function a2pBusinessProfileChanged(
  before: WorkspaceMessagingBusinessProfile,
  after: WorkspaceMessagingBusinessProfile,
): boolean {
  return (
    before.a2pCompanyType !== after.a2pCompanyType ||
    before.a2pStockExchange !== after.a2pStockExchange ||
    before.a2pStockTicker !== after.a2pStockTicker ||
    before.a2pBrandContactEmail !== after.a2pBrandContactEmail
  );
}

export function resolveA2pPolicySid(): string {
  return (
    process.env.TWILIO_A2P_MESSAGING_POLICY_SID?.trim() ||
    "RNb0d4771c2c98518d916a3d4cd70a8f8b"
  );
}
