import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    QUEUE_SETTABLE_STATUSES,
    type QueueSettableStatus,
} from "@/lib/queue-status";

interface StatusDropdownProps {
    currentStatus?: string;
    onSelect: (status: QueueSettableStatus) => void;
}

export function StatusDropdown({ currentStatus, onSelect }: StatusDropdownProps) {
    const currentValue =
        currentStatus && (QUEUE_SETTABLE_STATUSES as readonly string[]).includes(currentStatus)
            ? (currentStatus as QueueSettableStatus)
            : undefined;

    return (
        <Select
            value={currentValue}
            onValueChange={(value) => onSelect(value as QueueSettableStatus)}
        >
            <SelectTrigger className="h-6 text-xs px-2 rounded border border-gray-200">
                <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
                {QUEUE_SETTABLE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                        {status}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
