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
import { Tables } from "@/lib/database.types";

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
  const renderQueueContacts = () => {
    if (groupByHousehold && Object.keys(householdMap).length) {
      return Object.values(householdMap).flatMap((household) =>
        household.map((contact, index) => (
          <QueueContact
            key={`household-${contact.contact?.id}`}
            contact={contact.contact}
            household={household}
            firstInHouse={index === 0}
            grouped={true}
            selected={nextRecipient?.contact?.id === contact.contact?.id}
          />
        )),
      );
    }

    return queue.map((contact) => (
      <QueueContact
        key={contact.contact?.id}
        contact={contact.contact}
        selected={nextRecipient?.contact?.id === contact.contact?.id}
      />
    ));
  };

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
            <TableBody>{renderQueueContacts()}</TableBody>
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
