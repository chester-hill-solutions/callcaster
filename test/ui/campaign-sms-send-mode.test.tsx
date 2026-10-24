import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { CampaignSmsSendMode } from "@/components/campaign/settings/CampaignSmsSendMode";

function SendModeField({
  initialMode = "from_number",
  initialServiceSid = null,
  ready = true,
  busy = false,
}: {
  initialMode?: string;
  initialServiceSid?: string | null;
  ready?: boolean;
  busy?: boolean;
}) {
  const [settings, setSettings] = useState<
    Record<string, string | number | null>
  >({
    sms_send_mode: initialMode,
    sms_messaging_service_sid: initialServiceSid,
  });

  return (
    <>
      <CampaignSmsSendMode
        value={settings.sms_send_mode?.toString()}
        onChange={(name, value) => {
          setSettings((previous) => ({ ...previous, [name]: value }));
        }}
        isBusy={busy}
        smsSendContext={{
          messagingServiceReady: ready,
          defaultMessagingServiceSid: "MG_default_service",
        }}
      />
      <output aria-label="Send settings">{JSON.stringify(settings)}</output>
    </>
  );
}

describe("campaign Send using field (#2654)", () => {
  test.each([
    {
      mode: "from_number",
      ready: true,
      selected: "Phone number",
      help: "Choose the Phone number beside this field.",
    },
    {
      mode: "messaging_service",
      ready: true,
      selected: "Messaging Service",
      help: "Twilio sends from your Messaging Service pool.",
    },
    {
      mode: "from_number",
      ready: false,
      selected: "Phone number",
      help: "Messaging Service needs a configured SID and at least one sender. Finish onboarding or choose Phone number.",
    },
  ])(
    "names the $selected trigger and connects its help when ready=$ready",
    ({ mode, ready, selected, help }) => {
      render(<SendModeField initialMode={mode} ready={ready} />);
      const trigger = screen.getByRole("combobox", { name: "Send using" });
      expect(trigger).toHaveTextContent(selected);
      expect(trigger).toHaveAccessibleDescription(help);
      expect(trigger).not.toHaveAttribute("aria-invalid");
    },
  );

  test("keyboard selection updates both modes and the selected service SID", async () => {
    const user = userEvent.setup();
    render(<SendModeField />);
    const trigger = screen.getByRole("combobox", { name: "Send using" });
    trigger.focus();
    await user.keyboard("{Enter}");
    await screen.findByRole("option", { name: "Messaging Service" });
    await user.keyboard("{Home}{Enter}");
    expect(trigger).toHaveTextContent("Messaging Service");
    expect(screen.getByLabelText("Send settings")).toHaveTextContent(
      JSON.stringify({
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: "MG_default_service",
      }),
    );
    expect(trigger).toHaveAccessibleDescription(
      "Twilio sends from your Messaging Service pool.",
    );
    await waitFor(() => expect(trigger).toHaveFocus());

    await user.keyboard("{Enter}");
    await screen.findByRole("option", { name: "Phone number" });
    await user.keyboard("{End}{Enter}");
    expect(trigger).toHaveTextContent("Phone number");
    expect(screen.getByLabelText("Send settings")).toHaveTextContent(
      JSON.stringify({
        sms_send_mode: "from_number",
        sms_messaging_service_sid: null,
      }),
    );
    expect(trigger).toHaveAccessibleDescription(
      "Choose the Phone number beside this field.",
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  test("keeps a saved Messaging Service selection and SID when readiness is lost", () => {
    const { rerender } = render(
      <SendModeField
        initialMode="messaging_service"
        initialServiceSid="MG_saved_service"
      />,
    );
    rerender(
      <SendModeField
        initialMode="messaging_service"
        initialServiceSid="MG_saved_service"
        ready={false}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Send using" });
    expect(trigger).toHaveTextContent("Messaging Service");
    expect(trigger).toHaveAccessibleDescription(
      "Messaging Service needs a configured SID and at least one sender. Finish onboarding or choose Phone number.",
    );
    expect(screen.getByLabelText("Send settings")).toHaveTextContent(
      JSON.stringify({
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: "MG_saved_service",
      }),
    );
  });

  test("keeps an unready Messaging Service unavailable to keyboard selection", async () => {
    const user = userEvent.setup();
    render(<SendModeField ready={false} />);
    const trigger = screen.getByRole("combobox", { name: "Send using" });
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", { name: "Messaging Service" }),
    ).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Home}{Enter}");
    expect(trigger).toHaveTextContent("Phone number");
    expect(screen.getByLabelText("Send settings")).toHaveTextContent(
      JSON.stringify({
        sms_send_mode: "from_number",
        sms_messaging_service_sid: null,
      }),
    );
  });

  test("disables the named selector while a save is pending", async () => {
    const user = userEvent.setup();
    render(
      <SendModeField
        busy
        initialMode="messaging_service"
        initialServiceSid="MG_saved_service"
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "Send using" });
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Send settings")).toHaveTextContent(
      JSON.stringify({
        sms_send_mode: "messaging_service",
        sms_messaging_service_sid: "MG_saved_service",
      }),
    );
  });
});
