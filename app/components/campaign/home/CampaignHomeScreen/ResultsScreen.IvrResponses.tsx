import type { IvrQuestionResults } from "@/lib/ivr-results";

const ResponseBar = ({
  value,
  count,
  total,
}: {
  value: string;
  count: number;
  total: number;
}) => {
  const percent = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between gap-4">
        <span className="text-sm font-medium">{value}</span>
        <span className="shrink-0 text-sm font-medium text-muted-foreground">
          {count} ({percent.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div
          className="h-2.5 rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

const QuestionResults = ({ question }: { question: IvrQuestionResults }) => (
  <div className="mb-6 rounded-md border border-border p-4">
    <div className="mb-3">
      <h4 className="font-medium">{question.question}</h4>
      <p className="text-xs text-muted-foreground">
        {question.pageTitle ?? question.pageId} &middot; {question.total}{" "}
        {question.total === 1 ? "response" : "responses"}
        {question.isStaleKey
          ? " · recorded under a script block that has since been renamed or removed"
          : ""}
      </p>
    </div>
    {question.options.map((option) => (
      <ResponseBar
        key={option.value}
        value={option.value}
        count={option.count}
        total={question.total}
      />
    ))}
  </div>
);

export const IvrResponseBreakdown = ({
  ivrResponses,
}: {
  ivrResponses: IvrQuestionResults[];
}) => {
  if (!ivrResponses.length) {
    return (
      <div className="mb-8">
        <h3 className="mb-4 text-xl font-semibold">Response Breakdown</h3>
        <p className="text-sm text-muted-foreground">
          No keypress responses recorded yet. Responses appear here once contacts
          interact with the script.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h3 className="mb-4 text-xl font-semibold">Response Breakdown</h3>
      {ivrResponses.map((question) => (
        <QuestionResults
          key={`${question.pageId} ${question.question}`}
          question={question}
        />
      ))}
    </div>
  );
};
