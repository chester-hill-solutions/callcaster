import { SetStateAction, useCallback, useState } from "react";
import { Campaign, CampaignAudience, LiveCampaign, MessageCampaign, IVRCampaign, Script, QueueItem } from "~/lib/types";
import { Database } from "~/lib/database.types";
import { Json } from "~/lib/database.types";

type CampaignPageData = Campaign & {
  campaign_audience: CampaignAudience[];
  campaignDetails: LiveCampaign & { script: Script } | MessageCampaign | IVRCampaign & { script: Script };
  campaign_queue?: QueueItem[];
};

interface UseCampaignPageProps {
  initialData: CampaignPageData;
  campaignAudience: CampaignAudience[];
  campaignQueue: QueueItem[];
}

export function useCampaignPage({ initialData, campaignAudience, campaignQueue }: UseCampaignPageProps) {
  const [pageData, setPageData] = useState<CampaignPageData>({
    ...initialData,
    campaign_audience: campaignAudience,
    campaign_queue: campaignQueue,
  });

  const handlePageDataChange = useCallback(
    (
      newData: SetStateAction<{
        call_questions: Json | null;
        caller_id: string;
        created_at: string;
        dial_ratio: number;
        dial_type: Database["public"]["Enums"]["dial_types"] | null;
        end_date: string | null;
        group_household_queue: boolean;
        id: number;
        start_date: string | null;
        status: Database["public"]["Enums"]["campaign_status"] | null;
        title: string;
        type: Database["public"]["Enums"]["campaign_type"] | null;
        voicemail_file: string | null;
        workspace: string | null;
      } & { campaign_audience: CampaignAudience }>,
    ) => {
      setPageData(newData as any);
    },
    [],
  );

  return {
    pageData,
    handlePageDataChange,
  };
} 