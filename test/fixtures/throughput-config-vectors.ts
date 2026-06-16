import vectors from "../../supabase/functions/_shared/throughput-config-vectors.json";

export type ThroughputConfigVector = (typeof vectors)[number];

export { vectors as throughputConfigVectors };
