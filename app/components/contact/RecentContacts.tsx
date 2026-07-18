import React, { useCallback } from 'react';
import { Clipboard } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Heading } from '@/components/ui/typography';
import type { Contact, OutreachAttempt } from '@/lib/types';
import type { Json } from '@/lib/db-types';
import { safeString, formatDate, isObject, isArray } from '@/lib/type-safety-utils';
import { logger } from '@/lib/logger.client';

// Enhanced type definitions
export interface ResultItemProps {
  label: string;
  value: unknown;
}

export interface RecentContactsProps {
  contact?: Contact & { outreach_attempt?: OutreachAttemptWithCampaign[] };
}

type OutreachAttemptWithCampaign = OutreachAttempt & {
  campaign?: {
    title?: string | null;
    type?: string | null;
  } | null;
};

const ResultItem: React.FC<ResultItemProps> = ({ label, value }) => {
  const formatValue = (val: unknown): string => {
    try {
      if (val == null) return 'N/A';
      if (isArray(val)) return val.map((item) => safeString(item)).join(', ');
      if (isObject(val)) return Object.values(val).map((item) => safeString(item)).join(', ');
      return safeString(val);
    } catch (error) {
      logger.error('Error formatting value:', error);
      return 'Error';
    }
  };

  const formatLabel = (label: string): string => {
    try {
      return label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } catch (error) {
      logger.error('Error formatting label:', error);
      return label;
    }
  };

  return (
    <li className="text-sm text-muted-foreground">
      <span className="font-medium">{formatLabel(label)}:</span>{" "}
      <span className="text-foreground">{formatValue(value)}</span>
    </li>
  );
};

function AttemptAccordionItem({
  attempt,
  index,
}: {
  attempt: OutreachAttemptWithCampaign;
  index: number;
}) {
  const formatDateString = useCallback((dateString: string): string => {
    return formatDate(dateString);
  }, []);

  const getCampaignTitle = useCallback((): string => {
    try {
      return attempt.campaign?.title || 'Unknown Campaign';
    } catch (error) {
      logger.error('Error getting campaign title:', error);
      return 'Unknown Campaign';
    }
  }, [attempt.campaign]);

  const getCampaignType = useCallback((): string => {
    try {
      return attempt.campaign?.type?.replace(/_/g, ' ') || 'Unknown Type';
    } catch (error) {
      logger.error('Error getting campaign type:', error);
      return 'Unknown Type';
    }
  }, [attempt.campaign]);

  const getDisposition = useCallback((): string => {
    try {
      return attempt.disposition || 'N/A';
    } catch (error) {
      logger.error('Error getting disposition:', error);
      return 'N/A';
    }
  }, [attempt.disposition]);

  const getResultData = useCallback((): Array<{ key: string; value: Json }> => {
    try {
      if (!attempt.result || !isObject(attempt.result)) return [];

      return Object.entries(attempt.result)
        .map(([key, value]) => ({ key, value }))
        .filter((entry): entry is { key: string; value: Json } => entry.value != null);
    } catch (error) {
      logger.error('Error extracting result data:', error);
      return [];
    }
  }, [attempt.result]);

  const campaignTitle = getCampaignTitle();
  const resultData = getResultData();

  return (
    <AccordionItem value={`attempt-${attempt.id}-${index}`}>
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex flex-1 items-center justify-between gap-4 pr-2 text-left">
          <div className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate font-semibold text-foreground">{campaignTitle}</span>
            <span className="text-sm font-medium text-muted-foreground">
              {formatDateString(attempt.created_at)}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Clipboard className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="text-sm font-semibold capitalize text-foreground">
              {getDisposition()}
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        {resultData.length > 0 ? (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm font-semibold capitalize text-foreground">
              {getCampaignType()}
            </p>
            <ul className="space-y-2">
              {resultData.map(({ key, value }) => (
                <li key={key}>
                  <p className="mb-1 text-sm font-medium capitalize text-foreground">
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
        ) : (
          <p className="text-sm text-muted-foreground">No result details recorded.</p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export const RecentContacts: React.FC<RecentContactsProps> = ({ contact }) => {
  const getRecentAttempts = useCallback((): OutreachAttemptWithCampaign[] => {
    try {
      if (!contact?.outreach_attempt?.length) return [];
      return contact.outreach_attempt.slice(-5).reverse();
    } catch (error) {
      logger.error('Error getting recent attempts:', error);
      return [];
    }
  }, [contact]);

  const recentAttempts = getRecentAttempts();

  return (
    <div className="border-t border-border pt-6">
      <Heading level={4} className="mb-4">Recent Activity</Heading>
      {recentAttempts.length === 0 ? (
        <p className="py-4 text-center text-muted-foreground">
          No recent activity found for this contact.
        </p>
      ) : (
        <Accordion type="multiple" className="w-full rounded-md border border-border px-4">
          {recentAttempts.map((attempt, index) => (
            <AttemptAccordionItem
              key={`${attempt.id}-${index}`}
              attempt={attempt}
              index={index}
            />
          ))}
        </Accordion>
      )}
    </div>
  );
};

export default RecentContacts;
