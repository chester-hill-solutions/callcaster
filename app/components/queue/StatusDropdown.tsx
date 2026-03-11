const STATUS_OPTIONS = ["queued", "dequeued"] as const;

interface StatusDropdownProps {
    currentStatus?: string;
    onSelect: (status: typeof STATUS_OPTIONS[number]) => void;
}

export function StatusDropdown({ currentStatus, onSelect }: StatusDropdownProps) {
    const currentValue = currentStatus && STATUS_OPTIONS.includes(currentStatus as typeof STATUS_OPTIONS[number])
        ? currentStatus
        : "";

    return (
        <select 
            value={currentValue} 
            onChange={(e) => onSelect(e.target.value as typeof STATUS_OPTIONS[number])}
            className="h-6 text-xs px-2 rounded border border-gray-200"
        >
            <option value="" disabled>Status</option>
            {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                    {status}
                </option>
            ))}
        </select>
    );
}