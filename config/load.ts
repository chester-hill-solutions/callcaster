import { baseProjectConfig } from "./base";
import { environmentConfigs } from "./environments";
import { z } from "zod";
import {
  ConfigValidationError,
  EnvironmentNameSchema,
  LocalProfileInputSchema,
  type LocalProfileIdentity,
  type LocalProfileInput,
  parseProjectConfig,
  ProjectConfigOverlaySchema,
  type EnvironmentName,
  type ProjectConfig,
  type ProjectConfigOverlay,
  type ProjectConfigMap,
  validateInheritanceGraph,
} from "./schema";

function mergeObjects<T extends Record<string, unknown>>(left: T, right: Partial<T>): T {
  const result = { ...left } as T;
  for (const [key, value] of Object.entries(right)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key as keyof T] = mergeObjects(
        (result[key as keyof T] ?? {}) as Record<string, unknown>,
        value as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      result[key as keyof T] = value as T[keyof T];
    }
  }
  return result;
}

function invalid(message: string): never {
  throw new ConfigValidationError(new z.ZodError([{ code: "custom", path: [], message }]));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

/** Resolve one environment after validating every overlay and parent link. */
export function loadProjectConfig(
  environment: EnvironmentName,
  overlays: ProjectConfigMap = environmentConfigs,
): ProjectConfig {
  const requested = EnvironmentNameSchema.safeParse(environment);
  if (!requested.success) invalid(`unknown environment '${String(environment)}'`);

  const parsedOverlays = new Map<EnvironmentName, ProjectConfigOverlay>();
  for (const [name, value] of Object.entries(overlays)) {
    const key = EnvironmentNameSchema.safeParse(name);
    if (!key.success) invalid(`unknown environment '${name}'`);
    const parsed = ProjectConfigOverlaySchema.safeParse(value);
    if (!parsed.success) throw new ConfigValidationError(parsed.error);
    if (parsed.data.environment !== key.data) invalid(`map key must match environment '${name}'`);
    parsedOverlays.set(key.data, parsed.data);
  }

  validateInheritanceGraph(overlays);
  if (!parsedOverlays.has(requested.data)) invalid(`environment '${requested.data}' is not defined`);

  const resolved = new Map<EnvironmentName, ProjectConfig>();
  const resolve = (name: EnvironmentName): ProjectConfig => {
    const existing = resolved.get(name);
    if (existing) return existing;
    const overlay = parsedOverlays.get(name);
    if (!overlay) invalid(`environment '${name}' is not defined`);
    const parent = overlay.parent ? resolve(overlay.parent) : undefined;
    const merged = mergeObjects(
      parent ?? (baseProjectConfig as Record<string, unknown>),
      overlay as Record<string, unknown>,
    );
    const config = parseProjectConfig(merged);
    resolved.set(name, config);
    return config;
  };

  return deepFreeze(resolve(requested.data));
}

export type LocalProjectConfigResolution = {
  config: ProjectConfig;
  identity: LocalProfileIdentity;
};

/** Resolve local configuration for one developer without reading dotenv or process.env. */
export function resolveLocalProjectConfig(input: LocalProfileInput): LocalProjectConfigResolution {
  const profile = LocalProfileInputSchema.parse(input);
  const profileName = `${profile.devName}-${profile.envName}`;
  if (profileName.length > 63) invalid(`derived local profile name '${profileName}' exceeds the 63-character DNS label limit`);
  const derivedHostname = `${profileName}.callcaster.ca`;
  const publicUrl = profile.publicUrl ?? `https://${derivedHostname}`;
  const hostname = new URL(publicUrl).hostname;
  const config = loadProjectConfig("local", {
    ...environmentConfigs,
    local: {
      ...environmentConfigs.local,
      urls: { publicApp: publicUrl },
    },
  });

  return {
    config,
    identity: deepFreeze({
      devName: profile.devName,
      envName: profile.envName,
      profileName,
      hostname,
      publicUrl,
    }),
  };
}

export { environmentConfigs } from "./environments";
