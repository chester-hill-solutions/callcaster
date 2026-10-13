import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, useFetcher } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { useChatThread } from "@/hooks/chats/useChatThread";
import type { Message, Workspace } from "@/lib/types";
import { createWorkspaceEventSourceMock, installIntersectionObserverMock } from "./hooks-test-helpers";
vi.mock("@/lib/chats/messaging-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/chats/messaging-client")>()),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
}));
afterEach(() => vi.unstubAllGlobals());
test("a fetcher action revalidation must replace the server intent before delayed SSE UPDATE", async () => {
  installIntersectionObserverMock();
  const { emitWorkspaceEvent } = createWorkspaceEventSourceMock();
  const row = { workspace: "ws", body: "Thank you", from: "+15551111111", to: "+15552222222", direction: "outbound-api", date_created: "2026-10-13T12:00:00Z", client_ref: "staff-a" };
  const pending = { ...row, sid: "pending:staff-a", status: "queued" };
  const saved = { ...row, sid: "SM-a", status: "sent" };
  let rows: Message[] = [];
  let loaderReads = 0;
  const workspace = { id: "ws" } as NonNullable<Workspace>;
  function Thread() {
    const thread = useChatThread({ workspace });
    const fetcher = useFetcher();
    return <><button onClick={() => fetcher.submit(new FormData(), { method: "POST" })}>Send</button><output data-testid="ids">{thread.messages.map(message => message?.sid).join(",")}</output></>;
  }
  const router = createMemoryRouter([{
    path: "/workspaces/ws/chats/:contact_number",
    loader: () => { loaderReads++; return { messages: [...rows], hasMore: false, contact_number: "+15552222222", optOutKeywords: ["stop"] }; },
    action: async () => {
      emitWorkspaceEvent({ eventType: "INSERT", table: "message", new: pending, old: null });
      rows = [saved as Message];
      return { responseData: saved };
    },
    Component: Thread,
  }], { initialEntries: ["/workspaces/ws/chats/+15552222222"] });
  render(<RouterProvider router={router} />);
  await screen.findByRole("button", { name: "Send" });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(loaderReads).toBe(2));
  await waitFor(() => expect(screen.getByTestId("ids").textContent).toBe("SM-a"));
  act(() => emitWorkspaceEvent({ eventType: "UPDATE", table: "message", new: saved, old: pending }));
  expect(screen.getByTestId("ids").textContent).toBe("SM-a");
});
