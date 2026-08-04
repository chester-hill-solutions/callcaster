import { useMemo } from "react";
import QueueContact from "@/components/call/CallContact";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  callPanelBodyScrollClass,
  callPanelHeaderSecondaryClass,
  callPanelShellClass,
} from "@/components/call/call-panel-classes";
import type { Tables } from "@/lib/db-types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

interface HouseholdMap {
  [key: string]: QueueItem[];
}

interface QueueListProps {
  groupByHousehold: boolean;
  queue: QueueItem[];
  householdMap: HouseholdMap;
  handleNextNumber: (skipHousehold: boolean) => void;
  nextRecipient: QueueItem | null;
  predictive: boolean;
  handleQueueButton: () => void;
  isBusy: boolean;
  count: number;
  completed: number;
}

const QueueList = ({
  groupByHousehold = true,
  queue = [],
  householdMap,
  handleNextNumber,
  nextRecipient,
  predictive = false,
  handleQueueButton,
  isBusy,
  count,
  completed,
}: QueueListProps) => {
  // Households are derived once per householdMap identity change, not per render,
  // so QueueContact's `household` prop stays referentially stable across renders
  // that don't touch the queue (e.g. a call-advance that only moves nextRecipient).
  const households = useMemo(
    () => Object.values(householdMap),
    [householdMap],
  );

  const selectedContactId = nextRecipient?.contact?.id ?? null;

  // Recomputed only when the queue/grouping/selection actually change, so a
  // QueueList re-render triggered by unrelated props (isBusy, etc.) doesn't
  // rebuild this array. React.memo on QueueContact then skips re-rendering any
  // row whose props (contact/household/selected/...) didn't change.
  const queueRows = useMemo(() => {
    if (groupByHousehold && households.length) {
      return households.flatMap((household) =>
        household.map((contact, index) => (
          <QueueContact
            key={`household-${contact.contact?.id}`}
            contact={contact.contact}
            household={household}
            firstInHouse={index === 0}
            grouped={true}
            selected={selectedContactId === contact.contact?.id}
          />
        )),
      );
    }

    return queue.map((contact) => (
      <QueueContact
        key={contact.contact?.id}
        contact={contact.contact}
        selected={selectedContactId === contact.contact?.id}
      />
    ));
  }, [groupByHousehold, households, queue, selectedContactId]);

  return (
    <div className={callPanelShellClass}>
      <div className={callPanelHeaderSecondaryClass}>
        {!predictive ? (
          <div className="flex w-full gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="flex-1 font-Zilla-Slab text-xs"
              onClick={() => handleNextNumber(true)}
              disabled={isBusy}
            >
              Skip Household
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="flex-1 border-primary font-Zilla-Slab text-xs text-primary"
              onClick={() => handleNextNumber(false)}
              disabled={isBusy}
            >
              Skip Person
            </Button>
          </div>
        ) : (
          <span className="font-semibold">Recipient List</span>
        )}
      </div>

      <div className={callPanelBodyScrollClass}>
        <Table className="w-full border-collapse">
          <TableHeader>
            <TableRow>
              <TableHead hidden>Name</TableHead>
              <TableHead hidden>Number</TableHead>
              <TableHead hidden>Address</TableHead>
            </TableRow>
          </TableHeader>
          {queue.length > 0 ? (
            <TableBody>{queueRows}</TableBody>
          ) : (
            <TableBody>
              {!predictive && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-9 text-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-primary font-Zilla-Slab text-primary"
                      onClick={handleQueueButton}
                    >
                      Load Queue
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {!queue.length && count === 0 && completed === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-9 text-center">
                    <Text variant="muted">
                      Check with your administration to ensure your queue is set up.
                    </Text>
                  </TableCell>
                </TableRow>
              )}
              {!queue.length && completed > 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="px-4 py-9 text-center">
                    <Text variant="muted">You&apos;re all done! Great work.</Text>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          )}
        </Table>
      </div>
    </div>
  );
};

export { QueueList };
