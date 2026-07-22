import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { buildNumberPurchaseColumns } from "@/components/phone-numbers/NumberPurchase.columns";
import type { AvailableNumber } from "@/components/phone-numbers/NumberPurchase.constants";

function renderCapabilitiesCell(capabilities: Record<string, boolean>) {
  const columns = buildNumberPurchaseColumns(vi.fn(), false);
  const capabilityColumn = columns.find((column) => column.id === "capabilities");
  if (!capabilityColumn || typeof capabilityColumn.cell !== "function") {
    throw new Error("capabilities column missing");
  }
  const row = { original: { capabilities } as AvailableNumber };
  render(
    <>{(capabilityColumn.cell as (ctx: { row: typeof row }) => React.ReactNode)({ row })}</>,
  );
}

describe("app/components/phone-numbers/NumberPurchase.columns.tsx", () => {
  test("matches Twilio's mixed-case capability keys (#1073)", () => {
    // Twilio's AvailablePhoneNumber payload reports "voice" lowercase but
    // "SMS"/"MMS" uppercase.
    renderCapabilitiesCell({ voice: true, SMS: true, MMS: true, fax: false });

    expect(screen.getByText("voice")).toBeInTheDocument();
    expect(screen.getByText("sms")).toBeInTheDocument();
    expect(screen.getByText("mms")).toBeInTheDocument();
    expect(screen.queryByText("fax")).toBeNull();
  });

  test("renders a dash when nothing is enabled", () => {
    renderCapabilitiesCell({ voice: false });
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
