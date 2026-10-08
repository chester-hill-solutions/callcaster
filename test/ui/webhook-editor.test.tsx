import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import WebhookEditor from "@/components/workspace/WebhookEditor";

const boundary = vi.hoisted(() => ({ submit: vi.fn() }));
vi.mock("react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router")>()),
  Form: ({ children, ...props }: React.ComponentProps<"form">) => <form {...props}>{children}</form>,
  useFetcher: ({ key }: { key: string }) => ({ state: "idle", data: undefined, submit: key === "webhook-test" ? boundary.submit : vi.fn() }),
}));
beforeEach(() => { boundary.submit.mockClear(); });

describe("webhook editor test submission", () => {
  test("sends the workspace scope with an unsaved destination and header change", () => {
    render(<WebhookEditor userId="user-a" workspaceId="11111111-1111-4111-8111-111111111111" initialWebhook={{
      id: "hook-1", destination_url: "https://old.example", events: [{ category: "inbound_call", type: "INSERT" }], custom_headers: { "X-Test": "old" },
    }} />);
    fireEvent.change(screen.getByLabelText("Destination URL"), { target: { value: "https://new.example/unsaved" } });
    fireEvent.change(screen.getByPlaceholderText("Header Value"), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Test" }));
    expect(boundary.submit).toHaveBeenCalledOnce();
    const [body, options] = boundary.submit.mock.calls[0];
    expect(body).toMatchObject({ workspace_id: "11111111-1111-4111-8111-111111111111", destination_url: "https://new.example/unsaved", custom_headers: '[["X-Test","new"]]' });
    expect(JSON.parse(body.event)).toMatchObject({ workspace_id: "11111111-1111-4111-8111-111111111111", event_category: "inbound_call", event_type: "INSERT" });
    expect(options).toEqual({ method: "POST", action: "/api/test-webhook", encType: "application/json" });
  });
});
