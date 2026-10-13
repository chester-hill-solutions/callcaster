import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const phoneKeyReads = vi.hoisted(() => ({ count: 0 }));

vi.mock("@/lib/chat-conversation-sort", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/chat-conversation-sort")>();
  return {
    ...original,
    getConversationPhoneKey: (...args: Parameters<typeof original.getConversationPhoneKey>) => {
      phoneKeyReads.count += 1;
      return original.getConversationPhoneKey(...args);
    },
  };
});

import { ConversationList } from "@/routes/workspaces+/$id/chats/ConversationList";

describe("ConversationList scale", () => {
  test("keeps a 1,000-conversation list to one viewport of DOM rows", () => {
    const conversations = Array.from({ length: 1_000 }, (_, index) => ({
      contact_phone: `+1555${String(index).padStart(7, "0")}`,
      user_phone: "+15559990000",
      conversation_start: "2026-10-01T00:00:00.000Z",
      conversation_last_update: "2026-10-01T00:00:00.000Z",
      message_count: 1,
      unread_count: 0,
      contact_firstname: null,
      contact_surname: null,
    }));

    phoneKeyReads.count = 0;
    render(
      <ConversationList
        chats={[
          ...conversations,
          { ...conversations[0], contact_phone: "1 (555) 000-0000" },
        ]}
        handleExistingConversationClick={vi.fn()}
        formatDate={(value) => value}
      />,
    );

    expect(screen.getAllByRole("button").length).toBeLessThan(20);
    expect(phoneKeyReads.count).toBe(1_001);
  });

  test("deduplicates phone-number formats before virtualizing", () => {
    const first = {
      contact_phone: "+15550000000",
      user_phone: "+15559990000",
      conversation_start: "2026-10-01T00:00:00.000Z",
      conversation_last_update: "2026-10-01T00:00:00.000Z",
      message_count: 1,
      unread_count: 0,
      contact_firstname: null,
      contact_surname: null,
    };

    render(
      <ConversationList
        chats={[
          first,
          { ...first, contact_phone: "1 (555) 000-0000" },
          { ...first, contact_phone: "+15550000001" },
        ]}
        handleExistingConversationClick={vi.fn()}
        formatDate={(value) => value}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  test("renders the rows around the current scroll position", () => {
    const conversations = Array.from({ length: 1_000 }, (_, index) => ({
      contact_phone: `+1555${String(index).padStart(7, "0")}`,
      user_phone: "+15559990000",
      conversation_start: "2026-10-01T00:00:00.000Z",
      conversation_last_update: "2026-10-01T00:00:00.000Z",
      message_count: 1,
      unread_count: 0,
      contact_firstname: null,
      contact_surname: null,
    }));
    const scrollRoot = document.createElement("div");
    Object.defineProperty(scrollRoot, "clientHeight", { value: 320 });
    let scrollTop = 0;
    Object.defineProperty(scrollRoot, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
    document.body.append(scrollRoot);

    const { getByRole, queryByRole, getAllByRole } = render(
      <ConversationList
        chats={conversations}
        scrollRoot={scrollRoot}
        handleExistingConversationClick={vi.fn()}
        formatDate={(value) => value}
      />,
      { container: scrollRoot },
    );
    const list = getByRole("list");
    vi.spyOn(list, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          top: -scrollRoot.scrollTop,
          bottom: -scrollRoot.scrollTop + 80_000,
          left: 0,
          right: 0,
          width: 0,
          height: 80_000,
          x: 0,
          y: -scrollRoot.scrollTop,
          toJSON: () => ({}),
        }) as DOMRect,
    );

    act(() => {
      scrollRoot.scrollTop = 4_000;
      fireEvent.scroll(scrollRoot);
    });

    expect(getByRole("button", { name: /0000050/ })).toBeInTheDocument();
    expect(queryByRole("button", { name: /0000000/ })).not.toBeInTheDocument();
    expect(getAllByRole("button").length).toBeLessThan(20);
  });
});
