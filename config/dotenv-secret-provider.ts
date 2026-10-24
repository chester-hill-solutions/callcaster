import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";
import type { EnvironmentName, SecretName } from "./schema";
import { validateSecretRequest, type SecretServiceName } from "./secrets";
import type { SecretProvider } from "./secret-provider";

export type DotenvSecretProviderOptions = Readonly<{
  cwd?: string;
  shellEnv?: Readonly<Record<string, string | undefined>>;
}>;

export type SecretFileErrorKind = "unreadable";

export class DotenvSecretProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DotenvSecretProviderError";
  }
}

export class DotenvSecretFileError extends DotenvSecretProviderError {
  readonly kind: SecretFileErrorKind;
  readonly fileName: ".env" | ".env.local";

  constructor(fileName: ".env" | ".env.local", kind: SecretFileErrorKind) {
    super(`Secret provider 'dotenv' could not read ${fileName}`);
    this.name = "DotenvSecretFileError";
    this.kind = kind;
    this.fileName = fileName;
  }
}

export class DotenvSecretMissingError extends DotenvSecretProviderError {
  readonly secretName: SecretName;

  constructor(secretName: SecretName) {
    super(`Secret provider 'dotenv' has no value for '${secretName}'`);
    this.name = "DotenvSecretMissingError";
    this.secretName = secretName;
  }
}

export class DotenvSecretEmptyError extends DotenvSecretProviderError {
  readonly secretName: SecretName;

  constructor(secretName: SecretName) {
    super(`Secret provider 'dotenv' has an empty value for '${secretName}'`);
    this.name = "DotenvSecretEmptyError";
    this.secretName = secretName;
  }
}

async function readDotenvFile(cwd: string, fileName: ".env" | ".env.local"): Promise<Record<string, string>> {
  try {
    const contents = await readFile(path.join(cwd, fileName), "utf8");
    return parse(contents);
  } catch (error) {
    if (error instanceof DotenvSecretFileError) throw error;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw new DotenvSecretFileError(fileName, "unreadable");
  }
}

/** Read declared secrets from shell, .env.local, then .env without mutation. */
export class DotenvSecretProvider implements SecretProvider {
  readonly name = "dotenv";
  readonly environment: EnvironmentName;
  readonly service: SecretServiceName;
  private readonly cwd: string;
  private readonly shellEnv: Readonly<Record<string, string | undefined>>;

  constructor(environment: EnvironmentName, service: SecretServiceName, options: DotenvSecretProviderOptions = {}) {
    this.environment = environment;
    this.service = service;
    this.cwd = options.cwd ?? process.cwd();
    this.shellEnv = options.shellEnv ?? process.env;
  }

  async get(name: SecretName): Promise<string> {
    validateSecretRequest({
      environment: this.environment,
      service: this.service,
      names: [name],
    });
    const validatedName = name;
    const dotenvValues = await readDotenvFile(this.cwd, ".env");
    const localDotenvValues = await readDotenvFile(this.cwd, ".env.local");
    const value = this.shellEnv[validatedName] ?? localDotenvValues[validatedName] ?? dotenvValues[validatedName];

    if (value === undefined) throw new DotenvSecretMissingError(validatedName);
    if (value.length === 0) throw new DotenvSecretEmptyError(validatedName);
    return value;
  }
}
