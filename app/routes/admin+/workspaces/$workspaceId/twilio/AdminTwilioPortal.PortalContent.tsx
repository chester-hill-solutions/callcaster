import type { TwilioPageData } from "../loadTwilioData.server";

import { HealthPanel } from "./AdminTwilioPortal.HealthPanel";
import { ConfigChangesPanel } from "./AdminTwilioPortal.ConfigChangesPanel";
import { MessagingSignalsPanel } from "./AdminTwilioPortal.MessagingSignalsPanel";
import { OnboardingPanel } from "./AdminTwilioPortal.OnboardingPanel";
import { OperationalGuidancePanel } from "./AdminTwilioPortal.OperationalGuidancePanel";
import { PhoneNumbersPanel } from "./AdminTwilioPortal.PhoneNumbersPanel";
import { SendingSetupPanel } from "./AdminTwilioPortal.SendingSetupPanel";
import { SubaccountPanel } from "./AdminTwilioPortal.SubaccountPanel";
import { UsagePanel } from "./AdminTwilioPortal.UsagePanel";

export function PortalContent({ data }: { data: TwilioPageData }) {
    const {
        config,
        detectedTrafficClass,
        metrics,
        recommendations,
        supportRequestSummary,
        syncSnapshot,
        onboarding,
        readiness,
    } = data.portalSnapshot;

    return (
        <>
            <OnboardingPanel onboarding={onboarding} readiness={readiness} />
            <HealthPanel onboarding={onboarding} syncSnapshot={syncSnapshot} />
            <SendingSetupPanel
                config={config}
                detectedTrafficClass={detectedTrafficClass}
                metrics={metrics}
                syncSnapshot={syncSnapshot}
            />
            <OperationalGuidancePanel
                config={config}
                detectedTrafficClass={detectedTrafficClass}
                recommendations={recommendations}
                supportRequestSummary={supportRequestSummary}
            />
            <MessagingSignalsPanel metrics={metrics} />
            <ConfigChangesPanel auditTrail={config.auditTrail} />
            <SubaccountPanel twilioAccountInfo={data.twilioAccountInfo} />
            <PhoneNumbersPanel twilioNumbers={data.twilioNumbers} />
            <UsagePanel twilioUsage={data.twilioUsage} />
        </>
    );
}
