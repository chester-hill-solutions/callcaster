import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Clipboard, ChevronDown } from 'lucide-react';
import type { Contact, OutreachAttempt } from '@/lib/types';
import type { Json } from '@/lib/database.types';
import { safeString, formatDate, isObject, isArray } from '@/lib/type-utils';
import { logger } from '@/lib/logger.client';

// Enhanced type definitions
export interface ResultItemProps {
  label: string;
  value: unknown;
}

export interface AttemptCardProps {
  attempt: OutreachAttempt;
  isOpen: boolean;
  toggleOpen: () => void;
  index: number;
}

export interface RecentContactsProps {
  contact?: Contact & { outreach_attempt?: OutreachAttempt[] };
}

export interface RecentContactsState {
  openCards: Set<number>;
}

const ResultItem: React.FC<ResultItemProps> = ({ label, value }) => {
  // Helper function to safely format value using type utilities
  const formatValue = (val: unknown): string => {
    try {
      if (val == null) return 'N/A';
      if (isObject(val) || isArray(val)) return JSON.stringify(val);
      return safeString(val);
    } catch (error) {
      logger.error('Error formatting value:', error);
      return 'Error';
    }
  };

  // Helper function to safely format label
  const formatLabel = (label: string): string => {
    try {
      return label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch (error) {
      logger.error('Error formatting label:', error);
      return label;
    }
  };

  return (
    <li className="text-sm text-gray-600 dark:text-gray-400">
      <span className="font-medium">{formatLabel(label)}:</span>{" "}
      <span className="text-gray-800 dark:text-gray-200">{formatValue(value)}</span>
    </li>
  );
};

const AttemptCard: React.FC<AttemptCardProps> = ({ 
  attempt, 
  isOpen, 
  toggleOpen, 
  index 
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  // Helper function to safely format date using type utilities
  const formatDateString = useCallback((dateString: string): string => {
    return formatDate(dateString);
  }, []);

  // Helper function to safely get campaign title
  const getCampaignTitle = useCallback((): string => {
    try {
      return attempt.campaign?.title || 'Unknown Campaign';
    } catch (error) {
      logger.error('Error getting campaign title:', error);
      return 'Unknown Campaign';
    }
  }, [attempt.campaign]);

  // Helper function to safely get campaign type
  const getCampaignType = useCallback((): string => {
    try {
      return attempt.campaign?.type?.replace(/_/g, ' ') || 'Unknown Type';
    } catch (error) {
      logger.error('Error getting campaign type:', error);
      return 'Unknown Type';
    }
  }, [attempt.campaign]);

  // Helper function to safely get disposition
  const getDisposition = useCallback((): string => {
    try {
      return attempt.disposition || 'N/A';
    } catch (error) {
      logger.error('Error getting disposition:', error);
      return 'N/A';
    }
  }, [attempt.disposition]);

  // Helper function to safely extract result data using type utilities
  const getResultData = useCallback((): Array<{ key: string; value: Json }> => {
    try {
      if (!attempt.result || !isObject(attempt.result)) return [];
      
      return Object.entries(attempt.result)
        .map(([key, value]) => ({ key, value }))
        .filter(({ value }) => value != null);
    } catch (error) {
      logger.error('Error extracting result data:', error);
      return [];
    }
  }, [attempt.result]);

  return (
    <Card className="mb-4 overflow-hidden bg-white shadow-md transition-shadow duration-300 hover:shadow-lg dark:bg-gray-800">
      <CardContent className="p-4">
        <button
          className="w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-md"
          onClick={toggleOpen}
          aria-expanded={isOpen}
          aria-controls={`content-${index}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <b>{getCampaignTitle()} -</b>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {formatDateString(attempt.created_at)}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Clipboard className="h-5 w-5 text-green-500" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">
                {getDisposition()}
              </p>
              <ChevronDown
                className={`h-5 w-5 transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </div>
        </button>
        
        <div
          id={`content-${index}`}
          ref={contentRef}
          className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
          style={{
            maxHeight: isOpen ? `${contentRef.current?.scrollHeight}px` : "0px",
          }}
        >
          {getResultData().length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                {getCampaignType()}
              </p>
              <ul className="space-y-2">
                {getResultData().map(({ key, value }) => (
                  <li key={key}>
                    <p className="mb-1 text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                      {key.replace(/_/g, ' ')}:
                    </p>
                    <ul className="ml-6 space-y-1">
                      {typeof value === 'object' && value !== null ? (
                        Object.entries(value).map(([valKey, valVal]) => (
                          <ResultItem
                            key={`${key}-${valKey}`}
                            label={valKey}
                            value={valVal}
                          />
                        ))
                      ) : (
                        <ResultItem
                          key={key}
                          label={key}
                          value={value}
                        />
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export const RecentContacts: React.FC<RecentContactsProps> = ({ contact }) => {
  const [openCards, setOpenCards] = useState<Set<number>>(new Set());

  // Helper function to get recent attempts
  const getRecentAttempts = useCallback((): OutreachAttempt[] => {
    try {
      if (!contact?.outreach_attempt?.length) return [];
      return contact.outreach_attempt.slice(-5).reverse();
    } catch (error) {
      logger.error('Error getting recent attempts:', error);
      return [];
    }
  }, [contact]);

  // Enhanced toggle function with better type safety
  const toggleCard = useCallback((index: number): void => {
    try {
      setOpenCards(prev => {
        const newSet = new Set(prev);
        if (newSet.has(index)) {
          newSet.delete(index);
        } else {
          newSet.add(index);
        }
        return newSet;
      });
    } catch (error) {
      logger.error('Error toggling card:', error);
    }
  }, []);

  const recentAttempts = getRecentAttempts();

  if (recentAttempts.length === 0) {
    return (
      <div className="mt-6">
        <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
        <div className="text-center py-8 text-gray-500">
          <p>No recent activity found for this contact.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-xl font-semibold">Recent Activity</h3>
      <div className="space-y-4">
        {recentAttempts.map((attempt, index) => (
          <AttemptCard
            key={`${attempt.id}-${index}`}
            attempt={attempt}
            isOpen={openCards.has(index)}
            toggleOpen={() => toggleCard(index)}
            index={index}
          />
        ))}
      </div>
    </div>
  );
};

export default RecentContacts;