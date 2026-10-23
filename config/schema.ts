import { z } from "zod";
import { secretNames } from "./secret-names";

/** Environments supported by the shared project configuration. */
export const environmentNames = [
  "local",
  "sai-local",
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
  "sai-local": ["dotenv", "password-manager"],
  dev: ["password-manager", "railway"],
  qa: ["password-manager", "railway"],
  production: ["password-manager", "railway"],
};

/** A service receives a named, allowlisted slice of non-secret settings. */
export const ServiceSliceSchema = z
  .object({
    enabled: z.boolean().default(true),
    url: z.string().url().optional(),
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

export const ProjectConfigSchema = z
  .object({
    environment: EnvironmentNameSchema,
    parent: EnvironmentNameSchema.optional(),
    secretProvider: z
      .enum(secretProviderNames)
      .default("dotenv"),
    runtime: z
      .object({ mode: z.enum(["development", "test", "production"]).default("development") })
      .strict()
      .default({}),
    urls: z
      .object({ publicApp: z.string().url().optional() })
      .strict()
      .default({}),
    storage: z
      .object({
        endpoint: z.string().url().optional(),
        host: z.string().min(1).optional(),
        bucket: z.string().min(1).optional(),
        region: z.string().min(1).optional(),
      })
      .strict()
      .default({}),
    services: z
      .object({
        app: ServiceSliceSchema.default({}),
        worker: ServiceSliceSchema.default({}),
        "media-stream": ServiceSliceSchema.default({}),
        sim: ServiceSliceSchema.default({}),
      })
      .strict()
      .default({}),
  })
  .strict()
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

/** Validate parent links without resolving or merging environment overlays. */
export function validateInheritanceGraph(configs: ProjectConfigMap): void {
  const parsed = new Map<EnvironmentName, ProjectConfig>();
  for (const [name, value] of Object.entries(configs)) {
    const environment = EnvironmentNameSchema.safeParse(name);
    if (!environment.success) throw new ConfigValidationError(environment.error);
    const config = parseProjectConfig(value);
    if (config.environment !== environment.data) {
      throw new ConfigValidationError(
        new z.ZodError([{ code: "custom", path: ["environment"], message: "map key must match environment" }]),
      );
    }
    parsed.set(environment.data, config);
  }

  for (const [name, config] of parsed) {
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
      const next = parsed.get(current)?.parent;
      if (next && !parsed.has(next)) {
        throw new ConfigValidationError(
          new z.ZodError([{ code: "custom", path: ["parent"], message: `parent environment '${next}' is not defined` }]),
        );
      }
      current = next;
    }
  }
}
