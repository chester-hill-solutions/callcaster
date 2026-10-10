import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Result from "@/components/campaign/settings/script/Result";

describe("campaign script text", () => {
  test("preserves line breaks in the call screen script copy", () => {
    const scriptText = "Opening line\n\nINFO:\n- Website\n- Email";

    const { container } = render(
      <Result
        action={vi.fn()}
        initResult={null}
        questions={{
          id: "script-copy",
          type: "textarea",
          title: "Call script",
          content: scriptText,
          options: [],
        }}
        questionId="script-copy"
        disabled={false}
      />,
    );

    const copy = container.querySelector("p");
    expect(copy).not.toBeNull();
    expect(copy!.tagName).toBe("P");
    expect(copy).toHaveClass("whitespace-pre-wrap");
    expect(copy!.textContent).toBe(scriptText);
  });
});
