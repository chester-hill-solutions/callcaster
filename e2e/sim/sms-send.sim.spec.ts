import { expect, test } from "@playwright/test";
import { loadSimSmsCompatibilityInput } from "./config";
import { createSimRuntimeContext } from "./runtime-context";
import { prepareSimSmsTaskContext } from "./preflight";
import { uploadSimContactList } from "./tasks/contact-list";
import { ensureSmsCredits, smsCreditsRequired } from "./tasks/credits";
import { signInForSim } from "./tasks/sign-in";
import { sendSmsFromChats } from "./tasks/sms";

test.describe("SIM SMS @sim", () => {
  test("SIM-SMS-01 uploads the contact list, funds only the required credits, and sends through Chats", async ({ page }, testInfo) => {
    const runtime = await createSimRuntimeContext({ personaKey: "person-a" });
    const context = await prepareSimSmsTaskContext(runtime);
    const input = loadSimSmsCompatibilityInput();
    await signInForSim(page, { ...context, runtime });
    await uploadSimContactList({
      page,
      testInfo,
      context,
      input,
    });
    await ensureSmsCredits({
      page,
      context,
      input,
    });
    await sendSmsFromChats({
      page,
      context,
      input,
    });

    await testInfo.attach("sim-evidence.json", {
      body: JSON.stringify({
        environment: context.profile.runtimeIdentity,
        workspaceId: context.workspaceId,
        recipient: { alias: "approved-sim-recipient", phoneLast4: input.recipient.phone.slice(-4) },
        requiredCredits: smsCreditsRequired(input.message),
      }),
      contentType: "application/json",
    });
    await expect(page.getByText(input.message).last()).toBeVisible();
  });
});
