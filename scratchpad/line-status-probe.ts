import { Twilio } from "twilio";
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
for (const line of envText.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const TEST_NUMBERS = [
  { label: "num-1", e164: "+19058088017" },
  { label: "num-2", e164: "+19056811709" },
  { label: "num-3", e164: "+19058490737" },
];

const sid = process.env.TWILIO_SID ?? process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
if (!sid || !token) throw new Error("Missing TWILIO_SID / TWILIO_AUTH_TOKEN");
const client = new Twilio(sid, token);

console.log(
  [
    "label",
    "e164",
    "valid",
    "country",
    "lt.type",
    "lt.carrier",
    "lt.err",
    "ls.status",
    "ls.err",
    "latency_ms",
    "top_error",
  ].join("\t"),
);

for (const row of TEST_NUMBERS) {
  const t0 = Date.now();
  let valid = "";
  let country = "";
  let ltType = "";
  let ltCarrier = "";
  let ltErr = "";
  let lsStatus = "";
  let lsErr = "";
  let topErr = "";

  try {
    const res: any = await client.lookups.v2
      .phoneNumbers(row.e164)
      .fetch({ fields: "line_type_intelligence,line_status" });

    valid = String(res.valid);
    country = res.countryCode ?? "";

    if (res.lineTypeIntelligence) {
      ltType = res.lineTypeIntelligence.type ?? "";
      ltCarrier = res.lineTypeIntelligence.carrier_name ?? "";
      ltErr = String(res.lineTypeIntelligence.error_code ?? "");
    }
    if (res.lineStatus) {
      lsStatus = res.lineStatus.status ?? "";
      lsErr = String(res.lineStatus.error_code ?? "");
    }
  } catch (err: any) {
    topErr = err?.code ? `code=${err.code} ${err.message ?? ""}` : String(err?.message ?? err);
  }

  const latency = Date.now() - t0;
  console.log(
    [
      row.label,
      row.e164,
      valid,
      country,
      ltType,
      ltCarrier,
      ltErr,
      lsStatus,
      lsErr,
      latency,
      topErr,
    ].join("\t"),
  );
}
