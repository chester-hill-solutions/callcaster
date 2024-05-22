export const TableHeader = ({ keys = [] }) => (
    <thead>
        <tr style={{ padding: "8px 4px", background: "rgba(250,250,250)" }}>
            {keys.map((key, i) => <th key={`tableheader-${i}`} style={{ textAlign: "left", padding: "8px 16px", color:"#333" }} >{key}</th>)}
        </tr>
    </thead>
)