import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/typography";
import { numberRentalPriceLabel } from "@/lib/number-rental";
import type { AvailableNumber } from "@/components/phone-numbers/NumberPurchase.constants";
import type { ColumnDef } from "@tanstack/react-table";

function capabilityBadges(capabilities: Record<string, boolean>) {
  const entries = Object.entries(capabilities).filter(
    ([key, enabled]) =>
      enabled && ["voice", "sms", "mms", "fax"].includes(key),
  );
  if (entries.length === 0) {
    return <Text variant="muted">—</Text>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([cap]) => (
        <Badge key={cap} variant="secondary" className="text-xs uppercase">
          {cap}
        </Badge>
      ))}
    </div>
  );
}

export function buildNumberPurchaseColumns(
  onSelect: (number: AvailableNumber) => void,
  purchaseInFlight: boolean,
): ColumnDef<AvailableNumber>[] {
  return [
    {
      accessorKey: "friendlyName",
      header: "Name",
      cell: ({ row }) => (
        <span className="text-sm">{row.original.friendlyName}</span>
      ),
    },
    {
      accessorKey: "phoneNumber",
      header: "Number",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.phoneNumber}</span>
      ),
    },
    {
      id: "location",
      header: "Location",
      cell: ({ row }) => {
        const parts = [row.original.locality, row.original.region].filter(
          Boolean,
        );
        return (
          <span className="text-sm text-muted-foreground">
            {parts.length > 0 ? parts.join(", ") : "—"}
          </span>
        );
      },
    },
    {
      id: "capabilities",
      header: "Capabilities",
      cell: ({ row }) => capabilityBadges(row.original.capabilities),
    },
    {
      id: "price",
      header: "Price",
      cell: () => (
        <span className="text-sm whitespace-nowrap">
          {numberRentalPriceLabel()}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          disabled={purchaseInFlight}
          onClick={() => onSelect(row.original)}
        >
          Purchase
        </Button>
      ),
    },
  ];
}
