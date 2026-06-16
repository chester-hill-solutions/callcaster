import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { makeContact } from "./_helpers/component-smoke";

describe("app/components/call-list/records/participant/ContactInfo.tsx", () => {
  test("renders phone and email inputs", async () => {
    const { ContactInfo } = await import("@/components/call-list/records/participant/ContactInfo");
    const handleChange = vi.fn();
    const handleSave = vi.fn();
    render(
      <ContactInfo contact={makeContact()} handleChange={handleChange} handleSave={handleSave} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
      target: { name: "phone", value: "555" },
    });
    fireEvent.blur(screen.getByPlaceholderText("Phone Number"));
    expect(handleChange).toHaveBeenCalled();
    expect(handleSave).toHaveBeenCalled();
  });
});

describe("app/components/call-list/records/participant/Note.tsx", () => {
  test("updates note via action", async () => {
    const Note = (await import("@/components/call-list/records/participant/Note")).default;
    const action = vi.fn();
    render(<Note action={action} update="hello" />);
    fireEvent.change(screen.getByPlaceholderText("Notes/Key Issues"), {
      target: { value: "updated" },
    });
    expect(action).toHaveBeenCalledWith({ column: "Note", value: "updated" });
  });
});

describe("app/components/call-list/records/participant/SupportButton.tsx", () => {
  test("selects support option", async () => {
    const SupportButton = (await import("@/components/call-list/records/participant/SupportButton")).default;
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

describe("app/components/call-list/records/participant/Result.IconMap.tsx", () => {
  test("icon mapping exports keys", async () => {
    const { iconMapping } = await import("@/components/call-list/records/participant/Result.IconMap");
    expect(Object.keys(iconMapping).length).toBeGreaterThan(10);
    expect(iconMapping.Check).toBeDefined();
  });
});

describe("app/components/call-list/records/participant/Result.tsx", () => {
  test("single-select question", async () => {
    const Result = (await import("@/components/call-list/records/participant/Result")).default;
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
    const Result = (await import("@/components/call-list/records/participant/Result")).default;
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
