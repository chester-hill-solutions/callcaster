import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "@/components/workspace/tables/DataTable";
import { buildNumberPurchaseColumns } from "@/components/phone-numbers/NumberPurchase.columns";
import type { AvailableNumber } from "@/lib/numbers-search.types";

describe("regulatory address requirement on the search row (#2144)", () => {
  test.each([
    { requirement: "local", label: "Local address required" },
    { requirement: "foreign", label: "Foreign address required" },
    { requirement: "any", label: "Address required" },
  ] as const)(
    "shows $requirement before the purchase click",
    ({ requirement, label }) => {
      const number: AvailableNumber = {
        phoneNumber: "+14165550214",
        friendlyName: "Fixture",
        capabilities: { voice: true },
        addressRequirements: requirement,
      };
      const select = vi.fn();
      render(
        <DataTable
          columns={buildNumberPurchaseColumns(select, false)}
          data={[number]}
        />,
      );
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Purchase" })).toBeEnabled();
      expect(select).not.toHaveBeenCalled();
    },
  );
  test("none adds no address badge", () => {
    const number: AvailableNumber = {
      phoneNumber: "+14165550214",
      friendlyName: "Fixture",
      capabilities: {},
      addressRequirements: "none",
    };
    render(
      <DataTable
        columns={buildNumberPurchaseColumns(vi.fn(), false)}
        data={[number]}
      />,
    );
    expect(screen.queryByText(/address required/i)).toBeNull();
  });
});
