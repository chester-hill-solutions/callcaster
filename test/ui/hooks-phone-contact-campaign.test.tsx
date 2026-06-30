import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const contactSearchMocks = vi.hoisted(() => ({
  fetchContactsByPhone: vi.fn(),
  fetchLatestMessageForPhone: vi.fn(),
}));

vi.mock("@/lib/chats/messaging-client", () => contactSearchMocks);
vi.mock("@/lib/logger.client", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("phone, contact, campaign hooks", () => {
  test("usePhoneNumbers handles CRUD events", async () => {
    const { usePhoneNumbers } = await import("@/hooks/phone/usePhoneNumbers");
    const { result } = renderHook(() =>
      usePhoneNumbers([{ id: 1, workspace: "ws", phone: "+1" } as any], "ws"),
    );

    act(() => {
      result.current.updateWorkspaceNumbers({
        eventType: "INSERT",
        old: null,
        new: { id: 2, workspace: "ws" },
      });
    });
    expect(result.current.phoneNumbers).toHaveLength(2);

    act(() => {
      result.current.updateWorkspaceNumbers({
        eventType: "UPDATE",
        old: null,
        new: { id: 1, workspace: "ws", phone: "+2" },
      });
    });

    act(() => {
      result.current.updateWorkspaceNumbers({
        eventType: "DELETE",
        old: { id: 1 },
        new: null,
      });
    });

    act(() => {
      result.current.updateWorkspaceNumbers({ eventType: "INSERT", old: null, new: { workspace: "other" } });
      result.current.updateWorkspaceNumbers({ eventType: "INSERT", old: null, new: { workspace: "ws" } });
      result.current.updateWorkspaceNumbers({ eventType: "UPDATE", old: null, new: null });
      result.current.updateWorkspaceNumbers({ eventType: "DELETE", old: null, new: null });
      result.current.updateWorkspaceNumbers({ eventType: "UNKNOWN", old: null, new: null });
      result.current.updateWorkspaceNumbers({} as any);
    });
  });

  test("useContactSearch searches and handles UI", async () => {
    contactSearchMocks.fetchContactsByPhone.mockResolvedValue([{ id: 1, phone: "+15551234567" }]);
    contactSearchMocks.fetchLatestMessageForPhone.mockResolvedValue({
      body: "hi",
      date_created: new Date().toISOString(),
    });

    const { useContactSearch } = await import("@/hooks/contact/useContactSearch");
    const dropdownRef = { current: document.createElement("div") };
    document.body.appendChild(dropdownRef.current);

    const { result } = renderHook(() =>
      useContactSearch({
        workspace_id: "ws",
        contact_number: "+1 (555) 123-4567",
        potentialContacts: [],
        dropdownRef,
        initialContact: null,
      }),
    );

    act(() => {
      result.current.handleSearch({
        target: { value: "+1 (555) 123-4567" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    await waitFor(() => expect(result.current.isSearching).toBe(false));
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleSearch({
        target: { value: "+1 (555) 987-6543" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    await waitFor(() => expect(contactSearchMocks.fetchContactsByPhone).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.isSearching).toBe(false));
    expect(result.current.isValid).toBe(true);

    act(() => {
      result.current.handleContactSelect({ id: 2, phone: "+1" } as never);
      result.current.toggleContactMenu();
      result.current.clearSelectedContact();
    });

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    act(() => {
      outside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(result.current.isContactMenuOpen).toBe(false);
  });

});
