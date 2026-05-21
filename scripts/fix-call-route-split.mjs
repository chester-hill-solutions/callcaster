#!/usr/bin/env node
import fs from "node:fs";

const serverPath = "app/routes/workspaces_.$id_.campaigns.$campaign_id.call.server.tsx";
const clientPath = "app/routes/workspaces_.$id_.campaigns.$campaign_id.call.tsx";
const src = fs.readFileSync(serverPath, "utf8");
const marker = "const CallScreen: React.FC = () => {";
const idx = src.indexOf(marker);
if (idx === -1) {
  console.error("CallScreen marker not found");
  process.exit(1);
}

const serverPart = src.slice(0, idx).trim();
const clientBody = src.slice(idx).trim();

const client = `export { loader, action } from "./workspaces_.$id_.campaigns.$campaign_id.call.server";

${clientBody}
`;

const serverImportsToDrop =
  /^(import .+ from "react-router";|import .+useLoaderData|import .+useOutletContext|import .+useNavigation|import .+useNavigate|import .+useFetcher|import .+useRevalidator|import .+useEffect|import .+useState|import .+useCallback|import .+useRef|import .+@\/components\/call|import .+@\/hooks|import .+sonner|import \{ toast)/m;

const serverLines = serverPart.split("\n").filter((line) => {
  if (serverImportsToDrop.test(line)) return false;
  if (line.includes('from "@/components/call')) return false;
  if (line.includes('from "@/hooks/')) return false;
  if (line.includes("export { ErrorBoundary }")) return false;
  return true;
});

fs.writeFileSync(serverPath, `${serverLines.join("\n").trim()}\n`);
fs.writeFileSync(clientPath, `${client.trim()}\n`);
console.log("fixed call route split");
