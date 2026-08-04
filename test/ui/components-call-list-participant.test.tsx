import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

describe("app/components/campaign/settings/script/SupportButton.tsx", () => {
  test("selects support option", async () => {
    const SupportButton = (await import("@/components/campaign/settings/script/SupportButton")).default;
    const handleChange = vi.fn();
    render(
      <SupportButton
        option={{ value: "yes", content: "Yes" }}
        handleChange={handleChange}
        current=""
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(handleChange).toHaveBeenCalledWith("yes");
    render(
      <SupportButton
        option={{ value: "yes", content: "Yes" }}
        handleChange={handleChange}
        current="yes"
      />,
    );
  });
});

describe("app/components/campaign/settings/script/Result.IconMap.tsx", () => {
  test("icon mapping exports keys", async () => {
    const { iconMapping } = await import("@/components/campaign/settings/script/Result.IconMap");
    expect(Object.keys(iconMapping).length).toBeGreaterThan(10);
    expect(iconMapping.Check).toBeDefined();
  });
});

describe("app/components/campaign/settings/script/Result.tsx", () => {
  test("single-select question", async () => {
    const Result = (await import("@/components/campaign/settings/script/Result")).default;
    const action = vi.fn();
    const questions = {
      id: "q1",
      type: "radio",
      content: "Pick one",
      options: [
        { value: "a", content: "A", Icon: "Check" },
        { value: "b", content: "B", Icon: "SupportButton" },
        { value: "c", content: "C", Icon: "Unknown" },
      ],
    };
    render(
      <Result
        action={action}
        initResult=""
        questions={questions as never}
        questionId="q1"
        disabled={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /A/i }));
    expect(action).toHaveBeenCalled();
  });

  test("multi-select and IVR branches", async () => {
    const Result = (await import("@/components/campaign/settings/script/Result")).default;
    const action = vi.fn();
    const multi = {
      id: "q2",
      type: "multi",
      options: [{ value: "x", content: "X" }],
    };
    const { rerender } = render(
      <Result action={action} initResult={[]} questions={multi as never} questionId="q2" disabled={false} />,
    );
    const cb = screen.getByRole("checkbox");
    fireEvent.click(cb);
    expect(action).toHaveBeenCalled();

    const ivr = {
      id: "q3",
      type: "ivr",
      options: [{ value: "1", content: "1" } as never],
    };
    rerender(
      <Result action={action} initResult="" questions={ivr as never} questionId="q3" disabled />,
    );
  });
});
