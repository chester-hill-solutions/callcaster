import { useState, useCallback } from 'react';
import { Script, LiveCampaign, IVRCampaign } from '@/lib/types';
import { logger } from '@/lib/logger.client';

type PageData = {
  campaignDetails: (LiveCampaign | IVRCampaign) & { script: Script };
};

/**
 * Hook for managing campaign script state
 * 
 * Provides state management for campaign scripts, allowing updates to both the script
 * metadata and script steps. Automatically syncs changes back to parent component via
 * callback. Includes validation to prevent null/undefined updates.
 * 
 * @param initialPageData - Initial page data containing campaign and script
 * @param onPageDataChange - Callback function called when script data changes
 * 
 * @returns Object containing:
 *   - script: Current script object
 *   - scriptData: Current script steps data
 *   - updateScript: Function to update the script using an updater function
 *   - updateScriptData: Function to update script steps using an updater function
 * 
 * @example
 * ```tsx
 * const {
 *   script,
 *   scriptData,
 *   updateScript,
 *   updateScriptData
 * } = useScriptState(pageData, (newData) => {
 *   // Handle script changes
 *   setPageData(newData);
 * });
 * 
 * // Update script metadata
 * updateScript((prevScript) => ({
 *   ...prevScript,
 *   name: 'Updated Script Name'
 * }));
 * 
 * // Update script steps
 * updateScriptData((prevSteps) => ({
 *   ...prevSteps,
 *   step1: { ...prevSteps.step1, content: 'New content' }
 * }));
 * ```
 */
export function useScriptState(initialPageData: PageData, onPageDataChange: (data: PageData) => void) {
  // Validate required parameters
  if (!initialPageData) {
    throw new Error('useScriptState: initialPageData is required');
  }
  if (!initialPageData.campaignDetails) {
    throw new Error('useScriptState: initialPageData.campaignDetails is required');
  }
  if (typeof onPageDataChange !== 'function') {
    throw new Error('useScriptState: onPageDataChange must be a function');
  }

  const [script, setScript] = useState(initialPageData.campaignDetails?.script);
  const [scriptData, setScriptData] = useState<Script['steps']>(initialPageData.campaignDetails?.script?.steps || {} as Script['steps']);

  const updateScript = useCallback((updater: (prevScript: Script) => Script) => {
    try {
      setScript((prevScript) => {
        if (!prevScript) {
          logger.error('Cannot update script: script is null or undefined');
          return prevScript;
        }
        const newScript = updater(prevScript);
        if (!newScript) {
          logger.error('Script updater returned null or undefined');
          return prevScript;
        }
        onPageDataChange({
          ...initialPageData,
          campaignDetails: {
            ...initialPageData.campaignDetails,
            script: newScript,
          },
        });
        return newScript;
      });
    } catch (error) {
      logger.error('Error updating script:', error);
    }
  }, [initialPageData, onPageDataChange]);

  const updateScriptData = useCallback((updater: (prevScriptData: Script['steps']) => Script['steps']) => {
    try {
      setScriptData((prevScriptData) => {
        if (!prevScriptData) {
          logger.error('Cannot update script data: scriptData is null or undefined');
          return prevScriptData;
        }
        const newScriptData = updater(prevScriptData);
        if (!newScriptData) {
          logger.error('Script data updater returned null or undefined');
          return prevScriptData;
        }
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
    } catch (error) {
      logger.error('Error updating script data:', error);
    }
  }, [initialPageData, onPageDataChange]);

  return { script, scriptData, updateScript, updateScriptData };
}