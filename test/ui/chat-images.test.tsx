import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import ChatImages from "@/components/sms-ui/ChatImages";

describe("ChatImages", () => {
  test("exposes a named remove control for each attachment", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();

    render(
      <ChatImages
        selectedImages={["https://cdn.example/a.png", "https://cdn.example/b.png"]}
        onRemove={onRemove}
      />,
    );

    const removeButtons = screen.getAllByRole("button", {
      name: /remove attachment/i,
    });
    expect(removeButtons).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Remove attachment 1" }));
    expect(onRemove).toHaveBeenCalledWith("https://cdn.example/a.png");
  });
});
