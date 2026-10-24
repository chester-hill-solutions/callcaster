import { z } from "zod";
import { resolveSecretPlan, secretServiceNames } from "./secrets";
import { secretNames } from "./secret-names";

/** Environments supported by the shared project configuration. */
export const environmentNames = [
  "local",
  "dev",
  "qa",
  "production",
] as const;

export const EnvironmentNameSchema = z.enum(environmentNames);
export type EnvironmentName = z.infer<typeof EnvironmentNameSchema>;

/** Secret names are references only. Secret values and providers are not config. */
export const SecretNameSchema = z.enum(secretNames).brand<"SecretName">();
export type SecretName = z.infer<typeof SecretNameSchema>;

export const SecretReferenceSchema = z
  .object({ name: SecretNameSchema })
  .strict();
export type SecretReference = z.infer<typeof SecretReferenceSchema>;

export const secretProviderNames = ["dotenv", "password-manager", "github", "railway"] as const;
export type SecretProviderName = (typeof secretProviderNames)[number];

/**
 * Local environments use local secret sources. Deployed environments run on
 * Railway; password-manager remains available for controlled migrations.
 * GitHub is retained for CI adapters, not as a runtime environment source.
 */
export const environmentProviderCompatibility: Record<EnvironmentName, readonly SecretProviderName[]> = {
  local: ["dotenv", "password-manager"],
  dev: ["password-manager", "railway"],
  qa: ["password-manager", "railway"],
  production: ["password-manager", "railway"],
};

const defaultSecretProviderByEnvironment: Record<EnvironmentName, SecretProviderName> = {
  local: "dotenv",
  dev: "railway",
  qa: "railway",
  production: "railway",
};

export function defaultSecretProvider(environment: EnvironmentName): SecretProviderName {
  return defaultSecretProviderByEnvironment[environment];
}

const safeProfileSegment = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must contain only lowercase letters, numbers, and single hyphens");

/** URLs shown in diagnostics must not carry credentials or hidden components. */
export function parseDiagnosticUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

const diagnosticUrl = z
  .string()
  .url()
  .superRefine((value, ctx) => {
    const url = parseDiagnosticUrl(value);
    if (!url) {
      try {
        new URL(value);
      } catch {
        return;
      }
      ctx.addIssue({ code: "custom", message: "must not include credentials, query strings, or fragments" });
    }
  });

/** Input supplied by a local developer; it is not read from process.env. */
export const LocalProfileInputSchema = z
  .object({
    devName: safeProfileSegment,
    envName: z.literal("local"),
    publicUrl: diagnosticUrl
      .refine((value) => {
        const url = parseDiagnosticUrl(value);
        return Boolean(url && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))));
      }, "must use https unless using local localhost")
      .optional(),
  })
  .strict();
export type LocalProfileInput = z.input<typeof LocalProfileInputSchema>;

export type LocalProfileIdentity = {
  devName: string;
  envName: "local";
  profileName: string;
  hostname: string;
  publicUrl: string;
};

/** A service receives a named, allowlisted slice of non-secret settings. */
export const ServiceSliceSchema = z
  .object({
    enabled: z.boolean().default(true),
    url: diagnosticUrl.optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    bucket: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    secrets: z.array(SecretReferenceSchema).default([]),
  })
  .strict()
  .superRefine((service, ctx) => {
    if (service.url && service.host) {
      try {
        if (new URL(service.url).hostname !== service.host) {
          ctx.addIssue({
            code: "custom",
            path: ["host"],
            message: "host must match the hostname in url",
          });
        }
      } catch {
        // url's own schema issue is the useful error for an invalid URL.
      }
    }
  });
export type ServiceSlice = z.infer<typeof ServiceSliceSchema>;

const projectConfigObjectSchema = z
  .object({
    environment: EnvironmentNameSchema,
    parent: EnvironmentNameSchema.optional(),
    secretProvider: z.enum(secretProviderNames),
    runtime: z.object({ mode: z.enum(["development", "test", "production"]).default("development") }).strict().default({ mode: "development" }),
    urls: z
      .object({ publicApp: diagnosticUrl.optional() })
      .strict()
      .default({}),
    storage: z
      .object({
        endpoint: diagnosticUrl.optional(),
        host: z.string().min(1).optional(),
        bucket: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
      })
      .strict()
      .default({}),
    services: z
      .object({
        app: ServiceSliceSchema.default({ enabled: true, secrets: [] }),
        worker: ServiceSliceSchema.default({ enabled: true, secrets: [] }),
        "media-stream": ServiceSliceSchema.default({ enabled: true, secrets: [] }),
        sim: ServiceSliceSchema.default({ enabled: true, secrets: [] }),
      })
      .strict()
      .default({
        app: { enabled: true, secrets: [] },
        worker: { enabled: true, secrets: [] },
        "media-stream": { enabled: true, secrets: [] },
        sim: { enabled: true, secrets: [] },
      }),
  })
  .strict();

const serviceOverlaySchema = z
  .object({
    enabled: z.boolean().optional(),
    url: diagnosticUrl.optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    bucket: z.string().min(1).optional(),
    region: z.string().min(1).optional(),
    secrets: z.array(SecretReferenceSchema).optional(),
  })
  .strict()
  .superRefine((service, ctx) => {
    if (service.url && service.host) {
      try {
        if (new URL(service.url).hostname !== service.host) {
          ctx.addIssue({ code: "custom", path: ["host"], message: "host must match the hostname in url" });
        }
      } catch {
        // The URL schema issue is the useful error for an invalid URL.
      }
    }
  });

/** A checked-in environment entry. Defaults are applied only after inheritance. */
export const ProjectConfigOverlaySchema = z
  .object({
    environment: EnvironmentNameSchema,
    parent: EnvironmentNameSchema.optional(),
    secretProvider: z.enum(secretProviderNames).optional(),
    runtime: z.object({ mode: z.enum(["development", "test", "production"]).optional() }).strict().optional(),
    urls: z.object({ publicApp: diagnosticUrl.optional() }).strict().optional(),
    storage: z
      .object({
        endpoint: diagnosticUrl.optional(),
        host: z.string().min(1).optional(),
        bucket: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    services: z
      .object({
        app: serviceOverlaySchema.optional(),
        worker: serviceOverlaySchema.optional(),
        "media-stream": serviceOverlaySchema.optional(),
        sim: serviceOverlaySchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ProjectConfigOverlay = z.infer<typeof ProjectConfigOverlaySchema>;

/** Apply a provider that is valid for the config's environment when omitted. */
export const ProjectConfigSchema = z
  .preprocess((input) => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return input;
    const config = input as Record<string, unknown>;
    if (config.secretProvider !== undefined) return input;
    const environment = EnvironmentNameSchema.safeParse(config.environment);
    if (!environment.success) return input;
    return { ...config, secretProvider: defaultSecretProviderByEnvironment[environment.data] };
  }, projectConfigObjectSchema)
  .superRefine((config, ctx) => {
    if (config.parent === config.environment) {
      ctx.addIssue({ code: "custom", path: ["parent"], message: "an environment cannot inherit from itself" });
    }

    if (!environmentProviderCompatibility[config.environment].includes(config.secretProvider)) {
      ctx.addIssue({
        code: "custom",
        path: ["secretProvider"],
        message: `secret provider '${config.secretProvider}' is not valid for ${config.environment}`,
      });
    }

    if (config.storage.endpoint && config.storage.host) {
      try {
        if (new URL(config.storage.endpoint).hostname !== config.storage.host) {
          ctx.addIssue({ code: "custom", path: ["storage", "host"], message: "host must match endpoint hostname" });
        }
      } catch {
        // endpoint's own schema issue is the useful error.
      }
    }

    for (const service of secretServiceNames) {
      for (const reference of config.services[service].secrets) {
        if (!resolveSecretPlan(config.environment, service).allowed.includes(reference.name)) {
          ctx.addIssue({
            code: "custom",
            path: ["services", service, "secrets"],
            message: `secret '${reference.name}' is not allowlisted for service '${service}'`,
          });
        }
      }
    }
  });

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export class ConfigValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(error: z.ZodError) {
    super(`Invalid project configuration: ${error.issues.map((issue) => issue.message).join("; ")}`);
    this.name = "ConfigValidationError";
    this.issues = error.issues;
  }
}

export function parseProjectConfig(input: unknown): ProjectConfig {
  const result = ProjectConfigSchema.safeParse(input);
  if (!result.success) throw new ConfigValidationError(result.error);
  return result.data;
}

export function safeParseProjectConfig(input: unknown) {
  return ProjectConfigSchema.safeParse(input);
}

export type ProjectConfigMap = Partial<Record<EnvironmentName, unknown>>;

export function assertProjectConfigMap(input: unknown): asserts input is ProjectConfigMap {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigValidationError(
      new z.ZodError([{ code: "custom", path: [], message: "overlay map must be a non-null object" }]),
    );
  }
}

/** Validate parent links without resolving or merging environment overlays. */
export function validateInheritanceGraph(configs: ProjectConfigMap): void {
  assertProjectConfigMap(configs);
  const parsed = new Map<EnvironmentName, ProjectConfigOverlay>();
  for (const [name, value] of Object.entries(configs)) {
    const environment = EnvironmentNameSchema.safeParse(name);
    if (!environment.success) throw new ConfigValidationError(environment.error);
    const result = ProjectConfigOverlaySchema.safeParse(value);
    if (!result.success) throw new ConfigValidationError(result.error);
    const config = result.data;
    if (config.environment !== environment.data) {
      throw new ConfigValidationError(
        new z.ZodError([{ code: "custom", path: ["environment"], message: "map key must match environment" }]),
      );
    }
    parsed.set(environment.data, config);
  }

  for (const [name, config] of parsed) {
    if (config.parent === name) {
      throw new ConfigValidationError(
        new z.ZodError([{ code: "custom", path: ["parent"], message: "an environment cannot inherit from itself" }]),
      );
    }
    if (config.parent === "production" && name !== "production") {
      throw new ConfigValidationError(
        new z.ZodError([{ code: "custom", path: ["parent"], message: "production cannot be a parent of a non-production environment" }]),
      );
    }
    const visiting = new Set<EnvironmentName>();
    let current: EnvironmentName | undefined = name;
    while (current) {
      if (visiting.has(current)) {
        throw new ConfigValidationError(
          new z.ZodError([{ code: "custom", path: ["parent"], message: "inheritance graph contains a circular parent reference" }]),
        );
      }
      visiting.add(current);
      const next: EnvironmentName | undefined = parsed.get(current)?.parent;
      if (next && !parsed.has(next)) {
        throw new ConfigValidationError(
          new z.ZodError([{ code: "custom", path: ["parent"], message: `parent environment '${next}' is not defined` }]),
        );
      }
      current = next;
    }
  }
}
