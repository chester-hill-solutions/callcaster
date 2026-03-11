import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/components/call-list/records/participant/Result", () => ({
  default: ({ questionId, initResult, action, disabled }: any) => {
    return (
      <div>
        <div data-testid={`init-${questionId}`}>{String(initResult)}</div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => action({ value: "v" })}
        >
          answer-{questionId}
        </button>
      </div>
    );
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

function makeCampaignDetails(overrides: Partial<any> = {}) {
  return {
    script: {
      steps: {
        pages: {
          p1: { id: "p1", title: "P1", blocks: ["b1"] },
          p2: { id: "p2", title: "P2", blocks: ["b2"] },
        },
        blocks: {
          b1: { type: "text", label: "B1" },
          b2: { type: "text", label: "B2" },
        },
      },
    },
    ...overrides,
  };
}

describe("app/components/call/CallScreen.Questionnaire.tsx", () => {
  test("renders blocks for current page, wires Result->handleResponse, and updates initResult from update/localUpdate", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    const handleResponse = vi.fn();

    const { rerender } = render(
      <CallQuestionnaire
        handleResponse={handleResponse}
        campaignDetails={makeCampaignDetails()}
        update={{ p1: { b1: "init" } }}
        nextRecipient={{ contact: { firstname: "A", surname: "B" } } as any}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    expect(screen.getByText("Script & Questionnaire - A B")).toBeInTheDocument();
    expect(screen.getByText("answer-b1")).toBeInTheDocument();
    expect(screen.getByTestId("init-b1").textContent).toBe("init");

    fireEvent.click(screen.getByText("answer-b1"));
    expect(handleResponse).toHaveBeenCalledWith({ pageId: "p1", blockId: "b1", value: "v" });

    // update prop change -> useEffect syncs localUpdate and initResult updates
    rerender(
      <CallQuestionnaire
        handleResponse={handleResponse}
        campaignDetails={makeCampaignDetails()}
        update={{ p1: { b1: "changed" } }}
        nextRecipient={{ contact: { firstname: "A", surname: "B" } } as any}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );
    expect(screen.getByTestId("init-b1").textContent).toBe("changed");
  });

  test("clicking answer with empty update uses fallback {} and updates initResult", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    const handleResponse = vi.fn();

    render(
      <CallQuestionnaire
        handleResponse={handleResponse}
        campaignDetails={makeCampaignDetails()}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    expect(screen.getByTestId("init-b1").textContent).toBe("null");
    fireEvent.click(screen.getByText("answer-b1"));
    expect(handleResponse).toHaveBeenCalledWith({ pageId: "p1", blockId: "b1", value: "v" });
    expect(screen.getByTestId("init-b1").textContent).toBe("v");
  });

  test("empty-string update value is coerced to null for initResult", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails()}
        update={{ p1: { b1: "" } }}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );
    expect(screen.getByTestId("init-b1").textContent).toBe("null");
  });

  test("page navigation buttons enable/disable and switch pages", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");

    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails()}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    const prev = screen.getByRole("button", { name: "Previous Page" });
    const next = screen.getByRole("button", { name: "Next Page" });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();

    fireEvent.click(next);
    expect(screen.getByText("answer-b2")).toBeInTheDocument();

    // now last page -> next disabled, prev enabled
    expect(screen.getByRole("button", { name: "Next Page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous Page" })).not.toBeDisabled();

    // click disabled next should not change page (covers inner guard)
    fireEvent.click(screen.getByRole("button", { name: "Next Page" }));
    expect(screen.getByText("answer-b2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous Page" }));
    expect(screen.getByText("answer-b1")).toBeInTheDocument();

    // click disabled prev on first page should not change page (covers inner guard)
    expect(screen.getByRole("button", { name: "Previous Page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous Page" }));
    expect(screen.getByText("answer-b1")).toBeInTheDocument();
  });

  test("isBusy disables navigation and Save; Save calls handleQuickSave", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    const handleQuickSave = vi.fn();

    const { rerender } = render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails()}
        update={{}}
        nextRecipient={null}
        handleQuickSave={handleQuickSave}
        disabled={false}
        isBusy={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(handleQuickSave).toHaveBeenCalledTimes(1);

    rerender(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails()}
        update={{}}
        nextRecipient={null}
        handleQuickSave={handleQuickSave}
        disabled={false}
        isBusy={true}
      />,
    );

    expect(screen.getByRole("button", { name: "Previous Page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next Page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  test("handles missing script/pages gracefully (no page buttons, no blocks)", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");

    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={{ script: {} } as any}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    expect(screen.getByText("Script & Questionnaire")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous Page" })).toBeNull();
    expect(screen.queryByText(/^answer-/)).toBeNull();
  });

  test("handles empty pages object (steps exist but pages empty)", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={{ script: { steps: { pages: {}, blocks: {} } } } as any}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );
    expect(screen.getByText("Script & Questionnaire")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous Page" })).toBeNull();
    expect(screen.queryByText(/^answer-/)).toBeNull();
  });

  test("renderBlock returns null when block id missing from script", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");

    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails({
          script: { steps: { pages: { p1: { id: "p1", title: "P1", blocks: ["missing"] } }, blocks: {} } },
        })}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    expect(screen.queryByText(/^answer-/)).toBeNull();
  });

  test("nullish page.blocks falls back to empty list", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails({
          script: {
            steps: {
              pages: {
                p1: { id: "p1", title: "P1", blocks: undefined as any },
              },
              blocks: {},
            },
          },
        })}
        update={{}}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );

    expect(screen.queryByText(/^answer-/)).toBeNull();
    expect(screen.getByRole("button", { name: "Previous Page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next Page" })).toBeInTheDocument();
  });

  test("update prop can be undefined (defaults localUpdate to {})", async () => {
    const { CallQuestionnaire } = await import("@/components/call/CallScreen.Questionnaire");
    render(
      <CallQuestionnaire
        handleResponse={vi.fn()}
        campaignDetails={makeCampaignDetails()}
        update={undefined as any}
        nextRecipient={null}
        handleQuickSave={vi.fn()}
        disabled={false}
        isBusy={false}
      />,
    );
    expect(screen.getByText("answer-b1")).toBeInTheDocument();
  });
});

