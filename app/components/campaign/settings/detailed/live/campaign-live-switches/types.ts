export interface CampaignLiveSwitchProps {
  handleInputChange: (name: string, value: boolean | string) => void;
  campaignData: {
    group_household_queue?: boolean;
    dial_type?: string;
  };
}
