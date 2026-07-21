import { useCallback } from "react";
import { useFetcher } from "react-router";
import type { RoutingPresetSubmission } from "@/components/phone-numbers/NumberSummaryList";

function numbersSettingsActionPath(workspaceId: string): string {
  return `/workspaces/${workspaceId}/settings/numbers`;
}

export function useWorkspaceNumberSettingsMutations(workspaceId: string) {
  const fetcher = useFetcher();
  const actionPath = numbersSettingsActionPath(workspaceId);
  const isBusy = fetcher.state !== "idle";

  const submit = useCallback(
    (formData: Record<string, string>) => {
      fetcher.submit(formData, { method: "POST", action: actionPath });
    },
    [fetcher, actionPath],
  );

  const onIncomingActivityChange = useCallback(
    (numberId: number, value: string) => {
      submit({
        formName: "update-incoming-activity",
        numberId: String(numberId),
        incomingActivity: value,
      });
    },
    [submit],
  );

  const onIncomingVoiceMessageChange = useCallback(
    (numberId: number, value: string) => {
      submit({
        formName: "update-incoming-voice-message",
        numberId: String(numberId),
        incomingVoiceMessage: value,
      });
    },
    [submit],
  );

  const onHandsetChange = useCallback(
    (numberId: number, enabled: boolean) => {
      submit({
        formName: "update-handset",
        numberId: String(numberId),
        handsetEnabled: String(enabled),
      });
    },
    [submit],
  );

  const onInboundRingCountChange = useCallback(
    (numberId: number, value: string) => {
      submit({
        formName: "update-inbound-ring-count",
        numberId: String(numberId),
        inboundRingCount: value,
      });
    },
    [submit],
  );

  const onInboundQueueChange = useCallback(
    (numberId: number, queueId: string) => {
      submit({
        formName: "update-inbound-queue",
        numberId: String(numberId),
        inboundQueueId: queueId,
      });
    },
    [submit],
  );

  const onInboundScriptChange = useCallback(
    (numberId: number, scriptId: string) => {
      submit({
        formName: "update-inbound-script",
        numberId: String(numberId),
        inboundScriptId: scriptId,
      });
    },
    [submit],
  );

  const onCallerIdChange = useCallback(
    (numberId: number, value: string) => {
      submit({
        formName: "update-caller-id",
        numberId: String(numberId),
        friendly_name: value,
      });
    },
    [submit],
  );

  const onNumberRemoval = useCallback(
    (numberId: number) => {
      submit({
        formName: "remove-number",
        numberId: String(numberId),
      });
    },
    [submit],
  );

  const onApplyPreset = useCallback(
    (submission: RoutingPresetSubmission) => {
      fetcher.submit(submission, { method: "POST", action: actionPath });
    },
    [fetcher, actionPath],
  );

  return {
    fetcher,
    actionPath,
    isBusy,
    onIncomingActivityChange,
    onIncomingVoiceMessageChange,
    onHandsetChange,
    onInboundRingCountChange,
    onInboundQueueChange,
    onInboundScriptChange,
    onCallerIdChange,
    onNumberRemoval,
    onApplyPreset,
  };
}
