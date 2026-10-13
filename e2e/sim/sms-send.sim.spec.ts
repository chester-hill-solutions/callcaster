import { expect, test } from "@playwright/test";
import { loadSaiLocalSmsConfig } from "./config";
import { uploadSimContactList } from "./tasks/contact-list";
import { ensureSmsCredits, smsCreditsRequired } from "./tasks/credits";
import { signInForSim } from "./tasks/sign-in";
import { sendSmsFromChats } from "./tasks/sms";

test.describe("SIM SMS @sim", () => {
  test("SIM-SMS-01 uploads the contact list, funds only the required credits, and sends through Chats", async ({ page }, testInfo) => {
    const sim = loadSaiLocalSmsConfig();
    await signInForSim(page, sim.sender);
    await uploadSimContactList({
      page,
      testInfo,
      workspaceId: sim.workspace.id,
      contact: sim.recipient,
    });
    await ensureSmsCredits({
      page,
      workspaceId: sim.workspace.id,
      message: sim.message,
      stripe: sim.stripe,
    });
    await sendSmsFromChats({
      page,
      workspaceId: sim.workspace.id,
      recipientPhone: sim.recipient.phone,
      message: sim.message,
    });

    await testInfo.attach("sim-evidence.json", {
      body: JSON.stringify({
        environment: "sai-local",
        workspaceId: sim.workspace.id,
        workspaceKey: sim.workspace.key,
        recipient: { alias: "sai-local-approved-recipient", phoneLast4: sim.recipient.phone.slice(-4) },
        requiredCredits: smsCreditsRequired(sim.message),
      }),
      contentType: "application/json",
    });
    await expect(page.getByText(sim.message).last()).toBeVisible();
  });
});
