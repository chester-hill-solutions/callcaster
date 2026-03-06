import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    submit: vi.fn(),
    logger: { debug: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
  };
});

vi.mock("@remix-run/react", () => {
  return {
    Form: (props: any) => <form {...props} />,
    useSubmit: () => (...args: any[]) => mocks.submit(...args),
    // Minimal Await impl: call render prop immediately.
    Await: ({ resolve, children }: any) => {
      return typeof children === "function" ? children(resolve) : children;
    },
  };
});

vi.mock("@/lib/logger.client", () => ({ logger: mocks.logger }));

vi.mock("react-icons/md", () => ({
  MdAddAPhoto: () => <span>add-photo</span>,
  MdTag: () => <span>tag</span>,
}));

function baseProps(overrides?: Partial<React.ComponentProps<any>>) {
  const onChange = vi.fn();
  return {
    onChange,
    mediaLinks: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
    details: {
      body_text: "",
      workspace: "w1",
      campaign_id: 123,
      message_media: ["a.png", "b.png"],
    },
    surveys: [],
    ...overrides,
  };
}

describe("app/components/MessageSettings.tsx", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.submit.mockReset();
    mocks.logger.debug.mockReset();
    mocks.logger.error.mockReset();
    mocks.logger.warn.mockReset();
    mocks.logger.info.mockReset();
    vi.useRealTimers();
  });

  test("renders media, toggles erase on hover, and removes image (DELETE submit + onChange filter)", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");
    const props = baseProps();

    render(<MessageSettings {...props} />);

    // Media renders via Await
    expect(screen.getByAltText("Campaign media 1")).toBeInTheDocument();

    // Hover shows remove button for a real imageId
    fireEvent.mouseEnter(screen.getByAltText("Campaign media 1").closest("div") as HTMLElement);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(mocks.submit).toHaveBeenCalled();
    expect(props.onChange).toHaveBeenCalledWith("message_media", ["b.png"]);

    fireEvent.mouseLeave(screen.getByAltText("Campaign media 1").closest("div") as HTMLElement);
  });

  test("removeImage uses message_media ?? [] fallback (mutable details object)", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");
    const onChange = vi.fn();
    const details: any = {
      body_text: "",
      workspace: "w1",
      campaign_id: 1,
      message_media: ["a.png"],
    };

    render(
      <MessageSettings
        mediaLinks={["https://cdn.example/a.png"]}
        details={details}
        onChange={onChange}
        surveys={[]}
      />,
    );

    fireEvent.mouseEnter(screen.getByAltText("Campaign media 1").closest("div") as HTMLElement);
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();

    // mutate prop object before click to exercise ?? [] branch inside removeImage
    details.message_media = null;
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(onChange).toHaveBeenCalledWith("message_media", []);
  });

  test("media render returns null when message_media is missing; hover guards when imageId missing", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");

    const props = baseProps({
      details: { body_text: "", workspace: "w1", campaign_id: 1, message_media: null },
    });
    const { container } = render(<MessageSettings {...props} />);
    expect(container.querySelector("img")).toBeFalsy();

    // Mismatch lengths => undefined imageId branch (no show/hide)
    const props2 = baseProps({
      details: { ...baseProps().details, message_media: [null as any] },
      mediaLinks: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
    });
    render(<MessageSettings {...props2} />);
    const img = screen.getByAltText("Campaign media 1");
    fireEvent.mouseEnter(img.closest("div") as HTMLElement);
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  test("debounces body_text changes (clears prior timer) and syncs when details.body_text prop changes", async () => {
    vi.useFakeTimers();
    const { MessageSettings } = await import("@/components/MessageSettings");

    const onChange = vi.fn();
    const { rerender } = render(
      <MessageSettings
        {...baseProps({
          onChange,
          details: { ...baseProps().details, body_text: "x", message_media: [] },
          mediaLinks: [],
        })}
      />,
    );

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("x");

    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.change(textarea, { target: { value: "hello2" } });

    expect(onChange).not.toHaveBeenCalledWith("body_text", "hello");
    await vi.advanceTimersByTimeAsync(500);
    expect(onChange).toHaveBeenCalledWith("body_text", "hello2");

    // prop -> state sync effect
    rerender(
      <MessageSettings
        {...baseProps({
          onChange,
          details: { ...baseProps().details, body_text: "new", message_media: [] },
          mediaLinks: [],
        })}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("new");
  });

  test("template tags dropdown inserts tags, function examples, and survey functions; closes after insert", async () => {
    vi.useFakeTimers();
    const { MessageSettings } = await import("@/components/MessageSettings");
    const onChange = vi.fn();
    const props = baseProps({
      onChange,
      mediaLinks: [],
      details: { ...baseProps().details, message_media: [], body_text: "" },
      surveys: [
        { survey_id: "s1", title: "S1" },
        { survey_id: "s2", title: "" }, // cover surveyTitle || "" fallback
      ],
    });

    const { container } = render(<MessageSettings {...props} />);

    const tagBtn = container.querySelector('button[title="Insert template tags"]') as HTMLButtonElement;
    fireEvent.click(tagBtn);
    expect(screen.getByText("Template Tags")).toBeInTheDocument();
    const dropdown = screen.getByText("Template Tags").closest("div")?.parentElement as HTMLElement;

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, 0);

    // Insert a template tag
    fireEvent.click(within(dropdown).getByText("{{firstname}}"));
    expect(textarea.value).toContain("{{firstname}}");
    expect(onChange).toHaveBeenCalledWith("body_text", "{{firstname}}");
    // dropdown closes
    expect(screen.queryByText("Template Tags")).toBeNull();

    await vi.runAllTimersAsync(); // selection focus timeout

    // reopen and insert a non-survey function example
    fireEvent.click(tagBtn);
    const funcHeading = screen.getByText("Function Examples");
    const funcSection = funcHeading.closest("div")?.parentElement as HTMLElement;
    const exText = within(funcSection).getAllByText('btoa({{phone}}:{{external_id}})')[0] as HTMLElement;
    fireEvent.click(exText.closest("button") as HTMLButtonElement);
    expect(textarea.value).toContain("btoa(");
    expect(onChange).toHaveBeenCalledWith("body_text", expect.stringContaining("btoa("));
    expect(screen.queryByText("Template Tags")).toBeNull();

    await vi.runAllTimersAsync();

    // reopen and insert survey function from surveys list
    fireEvent.click(tagBtn);
    fireEvent.click(screen.getByText("Generate survey link for S1").closest("button") as HTMLButtonElement);
    expect(textarea.value).toContain('survey({{contact_id}}, "s1")');
    expect(onChange).toHaveBeenCalledWith(
      "body_text",
      expect.stringContaining('survey({{contact_id}}, "s1")'),
    );
    expect(screen.queryByText("Template Tags")).toBeNull();

    await vi.runAllTimersAsync(); // insertSurveyFunction focus/selection timeout

    // reopen and insert survey function where surveyTitle is falsy (covers surveyTitle || "")
    fireEvent.click(tagBtn);
    const funcHeading2 = screen.getByText("Function Examples");
    const funcSection2 = funcHeading2.closest("div")?.parentElement as HTMLElement;
    const ex2 = within(funcSection2).getByText('survey({{contact_id}}, "s2")') as HTMLElement;
    fireEvent.click(ex2.closest("button") as HTMLButtonElement);
    expect(textarea.value).toContain('survey({{contact_id}}, "s2")');
    await vi.runAllTimersAsync();
  });

  test("template tag preview detects simple tags, fallbacks, btoa, survey; dedupes and shows preview link + unknown survey id", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");

    const props = baseProps({
      mediaLinks: [],
      details: {
        ...baseProps().details,
        message_media: [],
        body_text:
          '{{firstname}} {{firstname|"x"}} {{surname|"x"}} btoa({{phone}}:{{external_id}}) btoa({{phone}}:{{external_id}}) survey({{contact_id}}, "s1") survey({{contact_id}}, "s1") survey({{contact_id}}, surveyid)',
      },
      surveys: [],
    });

    render(<MessageSettings {...props} />);

    expect(screen.getByText("Template Tags Found:")).toBeInTheDocument();
    const preview = screen.getByText("Template Tags Found:").closest("div")?.parentElement as HTMLElement;
    expect(within(preview).getByText(/{{firstname}}/)).toBeInTheDocument();
    // firstname fallback should be detected but NOT added as a separate foundTag (already present)
    expect(within(preview).queryByText(/{{firstname\|"x"}}/)).toBeNull();
    expect(within(preview).getByText(/{{surname\|"x"}}/)).toBeInTheDocument();
    expect(within(preview).getAllByText(/Base64 function/).length).toBe(1); // deduped
    // two distinct survey() patterns (one quoted, one unquoted/unknown)
    expect(within(preview).getAllByText(/Survey link function/).length).toBe(2);

    // Survey link preview exists and includes extracted + unknown survey id
    const surveyPreview = screen.getByText("Survey Links Preview:").closest("div")?.parentElement as HTMLElement;
    expect(within(surveyPreview).getAllByText(/contact_id:s1/).length).toBe(2);
    expect(within(surveyPreview).getByText(/contact_id:unknown/)).toBeInTheDocument();
  });

  test("handleAddMedia no-ops when no file; submits multipart when file provided (campaignId nullish branch)", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");
    const props = baseProps({
      details: { ...baseProps().details, campaign_id: null, message_media: [] },
      mediaLinks: [],
    });

    const { container } = render(<MessageSettings {...props} />);
    const input = container.querySelector('input[type="file"]#add-image') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [] } });
    expect(mocks.submit).not.toHaveBeenCalled();

    const file = new File(["x"], "pic.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(mocks.submit).toHaveBeenCalled();
  });

  test("character and parts text handle singular/plural branches (details.body_text length)", async () => {
    const { MessageSettings } = await import("@/components/MessageSettings");

    const props1 = baseProps({
      mediaLinks: [],
      details: { ...baseProps().details, message_media: [], body_text: "a" },
    });
    const { unmount } = render(<MessageSettings {...props1} />);
    expect(screen.getByText(/character$/)).toBeInTheDocument(); // singular
    expect(screen.getByText(/1 part$/)).toBeInTheDocument();

    unmount();
    const props2 = baseProps({
      mediaLinks: [],
      details: { ...baseProps().details, message_media: [], body_text: "ab" },
    });
    const r2 = render(<MessageSettings {...props2} />);
    expect(screen.getByText(/characters$/)).toBeInTheDocument(); // plural
    expect(screen.getByText(/1 part$/)).toBeInTheDocument();

    r2.unmount();
    const props3 = baseProps({
      mediaLinks: [],
      details: { ...baseProps().details, message_media: [], body_text: "x".repeat(141) },
    });
    render(<MessageSettings {...props3} />);
    expect(screen.getByText(/2 parts$/)).toBeInTheDocument();
  });
});

