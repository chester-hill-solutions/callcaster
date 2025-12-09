import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clipboard, ChevronRight, ChevronDown } from "lucide-react";
import { Contact, OutreachAttempt, QueueItem } from "@/lib/types";

const ResultItem = ({ label, value }) => (
  <li className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
    <ChevronRight className="h-4 w-4 flex-shrink-0" />
    <span className="font-semibold capitalize">{label.replace("_", " ")}:</span>
    <span className="break-words">{value}</span>
  </li>
);

const AttemptCard = ({ attempt, isOpen, toggleOpen, index }) => {
  const contentRef = React.useRef(null);
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
            <b>{attempt.campaign?.title} -</b>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                {new Date(attempt.created_at).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Clipboard className="h-5 w-5 text-green-500" />
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize">
                {attempt.disposition || "N/A"}
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
          {attempt.result && Object.keys(attempt.result).length > 0 && (
            <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
              <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                {attempt.campaign?.type?.replace('_', " ")}
              </p>
              <ul className="space-y-2">
                {Object.entries(attempt.result).map(([key, value]) => (
                  <li key={key}>
                    <p className="mb-1 text-sm font-medium capitalize text-gray-700 dark:text-gray-300">
                      {key.replace("_", " ")}:
                    </p>
                    <ul className="ml-6 space-y-1">
                      {Object.entries(value || {}).map(([valKey, valVal]) => (
                        <ResultItem
                          key={`${key}-${valKey}`}
                          label={valKey}
                          value={valVal}
                        />
                      ))}
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

export const RecentContacts = ({ contact }: {contact?: Contact & {outreach_attempt: OutreachAttempt}}) => {
  const recentContacts = contact && contact?.outreach_attempt?.length > 0 ? contact.outreach_attempt.slice(-5).reverse() : [];
  const [openCard, setOpenCard] = useState(0);

  const toggleCard = (index) => {
    setOpenCard((curr) => (curr === index ? null : index));
  };

  return (
    <div className="mt-6">
      <h3 className="mb-4 text-2xl font-bold text-gray-800 dark:text-gray-200">
        Recent Contacts
      </h3>
      <div className="space-y-4">
        {recentContacts.map((attempt, index) => (
          <AttemptCard
            key={index}
            attempt={attempt}
            isOpen={openCard === index}
            toggleOpen={() => toggleCard(index)}
            index={index}
          />
        ))}
      </div>
    </div>
  );
};

export default RecentContacts;