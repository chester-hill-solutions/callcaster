import { simPersonas } from "../e2e/sim/personas";
import { assertValidSimPersonaCatalog } from "../e2e/sim/personas/validate";

try {
  assertValidSimPersonaCatalog(simPersonas);
  const keys = Object.keys(simPersonas);
  console.log(`SIM persona catalog valid: ${keys.length} personas (${keys.join(", ")})`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "SIM persona catalog validation failed");
  process.exitCode = 1;
}
