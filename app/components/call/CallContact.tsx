import { memo } from "react";
import type { Tables } from "@/lib/db-types";

type Contact = Tables<"contact">;
type QueueItem = Tables<"campaign_queue"> & { contact: Contact };

type QueueContactProps = {
  contact: Contact;
  household?: QueueItem[] | null;
  firstInHouse?: boolean;
  grouped?: boolean;
  selected?: boolean;
  isLast?: boolean;
};

const QueueContactImpl = ({
  contact,
  household = null,
  firstInHouse = false,
  grouped = false,
  selected = false,
  isLast = false,
}: QueueContactProps) => {
  const borderTop = grouped
    ? firstInHouse
      ? "2px solid hsl(var(--border))"
      : "2px solid hsl(var(--muted-foreground))"
    : "unset";

  const background = selected ? "hsl(var(--primary) / 0.12)" : "unset";
  const borderBottomLeftRadius = isLast ? "18px" : "unset";
  const phoneOpacity = !household ? "1" : firstInHouse ? "1" : ".6";

  const addressCellStyle = {
    padding: "8px 16px",
    verticalAlign: "middle" as const,
    background: !household
      ? "unset"
      : firstInHouse
        ? "hsl(var(--secondary))"
        : "unset",
    color: !household
      ? "unset"
      : firstInHouse
        ? "hsl(var(--foreground))"
        : "unset",
    borderBottomRightRadius: isLast ? "18px" : "unset",
  };
  return (
    <tr
      style={{
        fontSize: "small",
        borderTop,
        background,
        borderBottomLeftRadius,
      }}
    >
      <td style={{ padding: "8px 16px" }}>
        {contact?.firstname} {contact?.surname}
      </td>
      <td style={{ padding: "8px 16px", opacity: phoneOpacity }}>
        {contact?.phone}
      </td>
      {(firstInHouse || !household) && (
        <td style={addressCellStyle} rowSpan={household?.length}>
          {contact?.address}
        </td>
      )}
    </tr>
  );
};

const QueueContact = memo(QueueContactImpl);
QueueContact.displayName = "QueueContact";

export default QueueContact;
