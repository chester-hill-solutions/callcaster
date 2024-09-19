import { useState, useCallback } from 'react';
import { Script, LiveCampaign, IVRCampaign } from '~/lib/types';

type PageData = {
  campaignDetails: (LiveCampaign | IVRCampaign) & { script: Script };
};

export function useScriptState(initialPageData: PageData, onPageDataChange: (data: PageData) => void) {
  const [script, setScript] = useState(initialPageData.campaignDetails?.script);
  const [scriptData, setScriptData] = useState(initialPageData.campaignDetails?.script?.steps || {});

  const updateScript = useCallback((updater: (prevScript: Script) => Script) => {
    setScript((prevScript) => {
      const newScript = updater(prevScript);
      onPageDataChange({
        ...initialPageData,
        campaignDetails: {
          ...initialPageData.campaignDetails,
          script: newScript,
        },
      });
      return newScript;
    });
  }, [initialPageData, onPageDataChange]);

  const updateScriptData = useCallback((updater: (prevScriptData: any) => any) => {
    setScriptData((prevScriptData) => {
      const newScriptData = updater(prevScriptData);
      onPageDataChange({
        ...initialPageData,
        campaignDetails: {
          ...initialPageData.campaignDetails,
          script: {
            ...initialPageData.campaignDetails.script,
            steps: newScriptData,
          },
        },
      });
      return newScriptData;
    });
  }, [initialPageData, onPageDataChange]);

  return { script, scriptData, updateScript, updateScriptData };
}