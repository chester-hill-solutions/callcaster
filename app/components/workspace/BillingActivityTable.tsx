import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Text } from "@/components/ui/typography";
import {
  projectBillingActivity,
  type BillingActivityRow,
} from "@/lib/billing-activity-projection";

type BillingActivityTableProps = {
  history: BillingActivityRow[];
};

function SupportDetail({
  label,
  value,
  monospaced = false,
}: {
  label: string;
  value: string | null;
  monospaced?: boolean;
}) {
  return (
    <div>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd
        className={
          monospaced
            ? "break-all font-mono text-xs text-muted-foreground"
            : "break-words text-muted-foreground"
        }
      >
        {value || "—"}
      </dd>
    </div>
  );
}

export function BillingActivityTable({
  history,
}: BillingActivityTableProps) {
  const activities = history.map(projectBillingActivity);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {activities.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="py-8 text-center">
                <Text variant="muted">
                  Purchases and campaign activity will appear here.
                </Text>
              </TableCell>
            </TableRow>
          ) : null}
          {activities.map((activity) => (
            <TableRow key={activity.id}>
              <TableCell className="whitespace-nowrap align-top">
                {new Date(activity.occurredAt).toLocaleString()}
              </TableCell>
              <TableCell className="min-w-64 align-top">
                <div className="font-medium">{activity.activity}</div>
                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-0">
                    <AccordionTrigger className="w-fit gap-1 py-1 text-xs font-normal text-muted-foreground hover:no-underline">
                      <span aria-hidden="true">Advanced</span>
                      <span className="sr-only">
                        Advanced details for {activity.activity}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="pt-2">
                      <dl className="grid gap-3 rounded-md bg-muted/30 p-3 text-xs sm:grid-cols-2">
                        <SupportDetail
                          label="Provider"
                          value={activity.advanced.provider}
                        />
                        <SupportDetail
                          label="Reference"
                          value={activity.advanced.reference}
                          monospaced
                        />
                        <SupportDetail
                          label="Idempotency key"
                          value={activity.advanced.idempotencyKey}
                          monospaced
                        />
                        <SupportDetail
                          label="Raw note"
                          value={activity.advanced.rawNote}
                        />
                      </dl>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TableCell>
              <TableCell
                className={`whitespace-nowrap text-right align-top font-medium ${
                  activity.direction === "credit"
                    ? "text-success"
                    : "text-destructive"
                }`}
              >
                {activity.amount}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
