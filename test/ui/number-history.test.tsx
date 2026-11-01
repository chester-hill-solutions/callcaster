import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { NumberHistory } from "@/components/phone-numbers/NumberHistory";
import { usePhoneNumbers } from "@/hooks/phone/usePhoneNumbers";
import { canSpendFromNumber } from "@/lib/number-rental-lifecycle";
import type { WorkspaceNumbers } from "@/lib/types";
import type { WorkspaceNumberHistoryRow } from "@/lib/workspace-number-history.server";

vi.hoisted(() => { process.env.TZ = "UTC"; });
const date = "2026-10-01T12:00:00.000Z";
const active: NonNullable<WorkspaceNumbers> = {
  id: 1, workspace: "owned", status: "active", released_at: null, type: "rented",
  phone_number: "+16135552995", friendly_name: "Owned line", created_at: "2026-08-01T00:00:00Z",
  capabilities: null, handset_enabled: false, inbound_action: null, inbound_audio: null,
  inbound_queue_id: null, inbound_ring_count: 4, inbound_script_id: null,
  rental_warned_cycle: null, suspended_at: null, twilio_phone_number_sid: null,
};
const released: NonNullable<WorkspaceNumbers> = { ...active, id: 2, phone_number: "+16135552996", status: "released", released_at: date };
function history(id: number): WorkspaceNumberHistoryRow {
  return { id: `number:${id}`, number_id: id, phone_number: `+1613555${String(id).padStart(4, "0")}`,
    friendly_name: `Past line ${id}`, type: "rented", released_at: date };
}

describe("read-only number history (#2995)", () => {
  test("shows the number, name and release date without mutation actions", () => {
    render(<NumberHistory rows={[history(1)]} />);
    expect(screen.getByRole("heading", { name: "Released number history" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /Past line 1/ });
    expect(within(row).getByText("+16135550001")).toBeInTheDocument();
    expect(within(row).getByText("Oct 1, 2026")).toHaveAttribute("dateTime", date);
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /release|purchase|edit|rent/i })).not.toBeInTheDocument();
  });
  test("paginates history and keeps every record accessible", async () => {
    const user = userEvent.setup();
    render(<NumberHistory rows={Array.from({ length: 11 }, (_, index) => history(index + 1))} />);
    expect(screen.getByText("Past line 1")).toBeInTheDocument();
    expect(screen.queryByText("Past line 11")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByText("Past line 11")).toBeInTheDocument();
    expect(screen.queryByText("Past line 1", { exact: true })).not.toBeInTheDocument();
  });
  test("shows an empty history without a fabricated date", () => {
    render(<NumberHistory rows={[]} />);
    expect(screen.getByText("No released numbers.")).toBeInTheDocument();
    expect(document.querySelector("time")).toBeNull();
  });
  test("initial and inserted history never enters live local state", () => {
    const { result } = renderHook(() => usePhoneNumbers([active, released], "owned"));
    expect(result.current.phoneNumbers).toEqual([active]);
    act(() => result.current.updateWorkspaceNumbers({ eventType: "INSERT", new: released, old: null }));
    expect(result.current.phoneNumbers).toEqual([active]);
    const next = { ...active, id: 3 };
    act(() => result.current.updateWorkspaceNumbers({ eventType: "INSERT", new: next, old: null }));
    expect(result.current.phoneNumbers).toEqual([active, next]);
  });
  test("a committed release update removes the live number", () => {
    const { result } = renderHook(() => usePhoneNumbers([active], "owned"));
    act(() => result.current.updateWorkspaceNumbers({ eventType: "UPDATE", old: active, new: { ...active, status: "released", released_at: date } }));
    expect(result.current.phoneNumbers).toEqual([]);
  });
  test("a foreign release update cannot remove an owned live number", () => {
    const { result } = renderHook(() => usePhoneNumbers([active], "owned"));
    act(() => result.current.updateWorkspaceNumbers({ eventType: "UPDATE", old: active, new: { ...active, workspace: "foreign", status: "released", released_at: date } }));
    expect(result.current.phoneNumbers).toEqual([active]);
  });
  test("released history cannot be used to spend even without suspension", () => {
    expect(canSpendFromNumber(active)).toBe(true);
    expect(canSpendFromNumber(released)).toBe(false);
  });
});
