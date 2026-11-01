import { expect, test } from "@playwright/test";
import { createSimBrowserContextOptions, loadSimSmsCompatibilityInput } from "./config";
import { createSimRuntimeContext } from "./runtime-context";
import { prepareSimSmsTaskContexts } from "./preflight";
import { uploadSimContactList } from "./tasks/contact-list";
import { ensureSmsCredits, smsCreditsRequired } from "./tasks/credits";
import { signInForSim } from "./tasks/sign-in";
import { sendSmsFromChats } from "./tasks/sms";

test.describe("SIM SMS @sim", () => {
  test("SIM-SMS-01 uploads the contact list, funds only the required credits, and sends through Chats", async ({ browser }, testInfo) => {
    const [ownerRuntime, memberRuntime] = await Promise.all([
      createSimRuntimeContext({ personaKey: "person-a" }),
      createSimRuntimeContext({ personaKey: "person-b" }),
    ]);
    const contexts = await prepareSimSmsTaskContexts({ owner: ownerRuntime, member: memberRuntime });
    const input = loadSimSmsCompatibilityInput();
    const browserContextOptions = createSimBrowserContextOptions(testInfo);
    const ownerBrowserContext = await browser.newContext(browserContextOptions);
    try {
      const ownerPage = await ownerBrowserContext.newPage();
      await signInForSim(ownerPage, { ...contexts.owner, runtime: ownerRuntime });
      await ensureSmsCredits({
        page: ownerPage,
        context: contexts.owner,
        input,
      });
    } finally {
      await ownerBrowserContext.close();
    }

    const memberBrowserContext = await browser.newContext(browserContextOptions);
    try {
      const memberPage = await memberBrowserContext.newPage();
      await signInForSim(memberPage, { ...contexts.member, runtime: memberRuntime });
      await uploadSimContactList({
        page: memberPage,
        testInfo,
        context: contexts.member,
        input,
      });
      await sendSmsFromChats({
        page: memberPage,
        context: contexts.member,
        input,
      });

      await testInfo.attach("sim-evidence.json", {
        body: JSON.stringify({
          environment: contexts.member.profile.runtimeIdentity,
          workspaceId: contexts.member.workspaceId,
          recipient: { alias: "approved-sim-recipient", phoneLast4: input.recipient.phone.slice(-4) },
          requiredCredits: smsCreditsRequired(input.message),
        }),
        contentType: "application/json",
      });
      await expect(memberPage.getByText(input.message).last()).toBeVisible();
    } finally {
      await memberBrowserContext.close();
    }
  });
});
