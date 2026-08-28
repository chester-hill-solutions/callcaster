import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const sid = process.env.TWILIO_SID ?? process.env.TWILIO_ACCOUNT_SID!;
const token = process.env.TWILIO_AUTH_TOKEN!;
const auth = "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");

const numbers = ["+19058088017", "+19056811709", "+19058490737"];

for (const n of numbers) {
  const url = new URL(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(n)}`);
  url.searchParams.set("Fields", "line_type_intelligence,line_status");
  const res = await fetch(url, { headers: { Authorization: auth } });
  const body = await res.json();
  console.log(`--- ${n} (HTTP ${res.status}) ---`);
  console.log(JSON.stringify(body, null, 2));
}
