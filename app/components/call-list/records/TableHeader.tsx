interface TableHeaderProps {
  keys?: string[];
}

export const TableHeader = ({ keys = [] }: TableHeaderProps) => (
    <thead>
        <tr style={{ padding: "8px 4px"}}>
            {keys.map((key, i) => <th hidden key={`tableheader-${i}`} style={{ textAlign: "left", padding: "8px 16px", color:"#333" }} >{key}</th>)}
        </tr>
    </thead>
)