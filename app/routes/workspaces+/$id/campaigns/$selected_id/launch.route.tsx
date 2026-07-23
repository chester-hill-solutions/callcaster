export { loader } from "./settings.loader.server";
export { action } from "./settings.action.server";

import { CampaignLaunch } from "@/components/campaign/settings/CampaignLaunch";
import { useCampaignSettingsController } from "@/components/campaign/settings/useCampaignSettingsController";

export default function CampaignLaunchRoute() {
  const {
    phoneNumbers,
    workspace_id,
    queueCount,
    dequeuedCount,
    scripts,
    mediaData,
    draftCampaignData,
    draftCampaignDetails,
    isChanged,
    confirmStatus,
    fetcher,
    isBusy,
    isSaving,
    activeIntent,
    feedbackMessage,
    feedbackTone,
    outboundEstimateInputs,
    campaignBilling,
    credits,
    startDisabledReason,
    scheduleDisabledReason,
    readinessIssues,
    launchLabel,
    handleDuplicate,
    handleConfirmStatus,
    handleInputChange,
    handleSave,
    handleResetData,
    handleStatusButton,
    handleScheduleButton,
  } = useCampaignSettingsController();

  return (
    <CampaignLaunch
      workspace={workspace_id}
      campaignData={draftCampaignData}
      campaignDetails={draftCampaignDetails as never}
      credits={credits}
      scripts={scripts}
      mediaData={mediaData}
      phoneNumbers={phoneNumbers}
      handleInputChange={handleInputChange}
      handleDuplicateButton={handleDuplicate}
      handleStatusButton={handleStatusButton}
      handleConfirmStatus={handleConfirmStatus}
      handleScheduleButton={handleScheduleButton}
      formFetcher={fetcher}
      startDisabledReason={startDisabledReason}
      readinessIssues={readinessIssues}
      queueCount={queueCount}
      dequeuedCount={dequeuedCount}
      isBusy={isBusy}
      isSaving={isSaving}
      activeIntent={activeIntent}
      feedbackMessage={feedbackMessage}
      feedbackTone={feedbackTone}
      scheduleDisabled={scheduleDisabledReason || false}
      confirmStatus={confirmStatus}
      isChanged={isChanged}
      handleSave={handleSave}
      handleResetData={handleResetData}
      outboundEstimateInputs={outboundEstimateInputs}
      launchActionLabelOverride={launchLabel}
      campaignBilling={campaignBilling}
    />
  );
}
