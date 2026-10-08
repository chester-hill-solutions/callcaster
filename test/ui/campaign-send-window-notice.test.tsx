import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { toast } from "sonner";
import { CampaignSendWindowNotice } from "@/components/campaign/CampaignSendWindowNotice";
import { Toaster } from "@/components/ui/sonner";
import type { Campaign } from "@/lib/types";

const running = { id: 2047, workspace: "ws-2047", type: "message", status: "running", sms_send_window: null } as Campaign;
beforeEach(() => { vi.useFakeTimers(); });
afterEach(async () => {
  toast.dismiss();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  vi.useRealTimers();
});
const tick = async (ms = 50) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
function page(campaign: Campaign | null) {
  return <StrictMode><MemoryRouter><main>Campaign results</main><CampaignSendWindowNotice campaign={campaign} canEdit /><Toaster position="top-right" /></MemoryRouter></StrictMode>;
}

test("running campaign warning remains readable after five minutes", async () => {
  render(page(running));
  await tick();
  expect(screen.getByText("Unrestricted SMS sending")).toBeInTheDocument();
  await tick(300_000);
  expect(screen.getByText(/any hour, including overnight/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit send window" })).toBeEnabled();
  expect(document.querySelector('[data-sonner-toast]')).toHaveAttribute("data-type", "warning");
});

test("resolving the saved window removes its notice", async () => {
  const view = render(page(running));
  await tick();
  view.rerender(page({ ...running, sms_send_window: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } } } as Campaign));
  await tick(1000);
  await tick(1000);
  expect(screen.queryByText("Unrestricted SMS sending")).not.toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveTextContent("Campaign results");
});

test("changing the warning updates one existing notice", async () => {
  const view = render(page(running));
  await tick();
  view.rerender(page({ ...running, schedule: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } } } as Campaign));
  await tick(1000);
  expect(screen.getAllByText("Unrestricted SMS sending")).toHaveLength(1);
  expect(screen.getByText(/voice schedule does not restrict SMS/)).toBeInTheDocument();
});

test("leaving the campaign removes its notice", async () => {
  const view = render(page(running));
  await tick();
  view.rerender(page(null));
  await tick(1000);
  await tick(1000);
  expect(screen.queryByText("Unrestricted SMS sending")).not.toBeInTheDocument();
});

test("a resolved window reopened during dismissal keeps the new warning", async () => {
  const view = render(page(running));
  await tick();
  view.rerender(page({ ...running, sms_send_window: { monday: { active: true, intervals: [{ start: "09:00", end: "17:00" }] } } } as Campaign));
  await tick(20);
  view.rerender(page(running));
  await tick(1000);
  await tick(1000);
  expect(screen.getAllByText("Unrestricted SMS sending")).toHaveLength(1);
});
