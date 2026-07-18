import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ConversationList } from "@/routes/workspaces+/$id/chats/ConversationList";

describe("ConversationList empty state", () => {
  test("uses the flat workspace empty state without Card chrome", () => {
    render(
      <ConversationList
        chats={[]}
        handleExistingConversationClick={vi.fn()}
        formatDate={(value) => value}
      />,
    );

    expect(
      screen.getByTestId("workspace-resource-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No conversations yet" })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});
