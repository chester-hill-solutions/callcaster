import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CampaignTestSendDialog } from "@/components/campaign/settings/CampaignTestSendDialog";

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  };
}

describe("CampaignTestSendDialog", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: memoryStorage(),
      configurable: true,
    });
  });

  test("submits the trimmed number, remembers it, and closes", () => {
    const onSend = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CampaignTestSendDialog open busy={false} onOpenChange={onOpenChange} onSend={onSend} />,
    );

    const submit = screen.getByTestId("campaign-test-send-submit");
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Phone number"), {
      target: { value: "  613 555 0199 " },
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    expect(onSend).toHaveBeenCalledWith("613 555 0199");
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(window.localStorage.getItem("callcaster:test-send-number")).toBe("613 555 0199");
  });

  test("prefills the last number used and disables while busy", () => {
    window.localStorage.setItem("callcaster:test-send-number", "+16135550199");
    render(
      <CampaignTestSendDialog open busy onOpenChange={vi.fn()} onSend={vi.fn()} />,
    );

    expect(screen.getByLabelText("Phone number")).toHaveValue("+16135550199");
    expect(screen.getByTestId("campaign-test-send-submit")).toBeDisabled();
    expect(screen.getByTestId("campaign-test-send-submit")).toHaveTextContent("Sending...");
  });

  test("uses call copy for voice campaigns", () => {
    render(
      <CampaignTestSendDialog open busy={false} kind="call" onOpenChange={vi.fn()} onSend={vi.fn()} />,
    );
    expect(screen.getByRole("heading", { name: "Place a test call" })).toBeInTheDocument();
    expect(screen.getByTestId("campaign-test-send-submit")).toHaveTextContent("Place test call");
    expect(screen.getByText(/voicemail drop/)).toBeInTheDocument();
  });
});
