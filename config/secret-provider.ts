import type { EnvironmentName, SecretName } from "./schema";
import type { SecretServiceName } from "./secrets";

/** A provider exposes one already-declared secret at a time. */
export interface SecretProvider {
  readonly name: string;
  readonly environment: EnvironmentName;
  readonly service: SecretServiceName;
  get(name: SecretName): Promise<string>;
}
