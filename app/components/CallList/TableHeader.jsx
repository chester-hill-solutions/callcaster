export const TableHeader = ({ keys = [] }) => (
    <thead>
        <tr className="bg-gray-700">
            {keys.map((key, i) => (
                <th key={`tableheader-${i}`} className="text-left px-4 py-2 text-gray-200">{key}</th>
            ))}
        </tr>
    </thead>
);
