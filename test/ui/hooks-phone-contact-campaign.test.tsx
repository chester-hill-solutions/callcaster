import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { createMockFetcher } from "./hooks-test-helpers";

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
    const { useContactSearch } = await import("@/hooks/contact/useContactSearch");
    const dropdownRef = { current: document.createElement("div") };
    document.body.appendChild(dropdownRef.current);

    const rpc = vi.fn().mockResolvedValue({ data: [{ id: 1, phone: "+15551234567" }], error: null });
    const supabase = {
      rpc,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { body: "hi", date_created: new Date().toISOString() },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    } as never;

    const { result } = renderHook(() =>
      useContactSearch({
        supabase,
        workspace_id: "ws",
        contact_number: "+1 (555) 123-4567",
        potentialContacts: [],
        dropdownRef,
        initialContact: null,
      }),
    );

    await waitFor(() => expect(result.current.isValid).toBe(true));

    act(() => {
      result.current.handleSearch({
        target: { value: "+1 (555) 987-6543" },
      } as React.ChangeEvent<HTMLInputElement>);
    });
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

  test("useScriptState updates script and steps", async () => {
    const { useScriptState } = await import("@/hooks/campaign/useScriptState");
    const onPageDataChange = vi.fn();
    const pageData = {
      campaignDetails: {
        script: { id: 1, name: "S", steps: { a: { content: "x" } } },
      },
    } as any;

    expect(() => useScriptState(null as any, onPageDataChange)).toThrow();
    expect(() => useScriptState({ campaignDetails: null } as any, onPageDataChange)).toThrow();
    expect(() => useScriptState(pageData, null as any)).toThrow();

    const { result } = renderHook(() => useScriptState(pageData, onPageDataChange));

    act(() => {
      result.current.updateScript((s) => ({ ...s, name: "S2" }));
      result.current.updateScriptData((d) => ({ ...d, b: { content: "y" } }));
    });
    expect(onPageDataChange).toHaveBeenCalled();
  });

  test("useCampaignSettings drives status and save flows", async () => {
    const { useCampaignSettings } = await import("@/hooks/campaign/useCampaignSettings");
    const navigate = vi.fn();
    const fetcher = createMockFetcher({
      submit: vi.fn(),
      state: "idle",
      data: { success: true, campaign: { title: "T2" }, campaignDetails: { script_id: 1 } },
    });

    const initialState = {
      campaign_id: "1",
      workspace: "ws",
      title: "T",
      status: "paused",
      type: "live_call",
      dial_type: "call",
      group_household_queue: false,
      start_date: "",
      end_date: "",
      caller_id: null,
      voicemail_file: null,
      script_id: 1,
      audiences: [],
      body_text: null,
      message_media: null,
      voicedrop_audio: null,
      schedule: null,
      is_active: false,
      details: { script_id: 1 },
    } as any;

    expect(() =>
      useCampaignSettings({ initialState: null as any, navigate, fetcher: fetcher as any }),
    ).toThrow();

    const { result } = renderHook(() =>
      useCampaignSettings({ initialState, navigate, fetcher: fetcher as any }),
    );

    act(() => result.current.updateCampaignField("title", "New"));
    act(() => result.current.handleAudienceChange({ audience_id: 9 } as any, true));
    act(() => result.current.handleAudienceChange({ audience_id: 9 } as any, false));
    act(() => result.current.handleStatusButtons("schedule"));
    act(() => result.current.handleStatusButtons("pause"));
    act(() => result.current.handleStatusButtons("play"));
    act(() => result.current.handleConfirmStatus("none"));
    act(() => result.current.handleSave());
    act(() => result.current.resetState());

    const failFetcher = createMockFetcher({
      state: "idle",
      data: { error: "fail" },
      submit: vi.fn(),
    });
    const hook2 = renderHook(() =>
      useCampaignSettings({
        initialState,
        navigate,
        fetcher: failFetcher as any,
      }),
    );
    act(() => {
      hook2.result.current.handleStatusButtons("play");
      hook2.result.current.handleConfirmStatus("none");
    });
    await waitFor(() => expect(hook2.result.current.state.title).toBe("T"));
  });
});
