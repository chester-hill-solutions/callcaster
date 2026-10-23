import { describe, expect, it, vi } from "vitest";
import { SecretNameSchema } from "../config/schema";
import {
  passwordManagerVendors,
  passwordManagerVendorContracts,
  type PasswordManagerAdapter,
  type PasswordManagerSecretMapping,
} from "../config/password-manager-contracts";
import {
  createPasswordManagerAdapterRegistry,
  PasswordManagerAdapterUnconfiguredError,
  PasswordManagerLookupError,
  PasswordManagerSecretDeniedError,
  PasswordManagerSecretEmptyError,
  PasswordManagerSecretMissingError,
  PasswordManagerSecretProvider,
  UnsupportedPasswordManagerAdapterError,
} from "../config/password-manager-secret-provider";

const secretName = SecretNameSchema.parse("DATABASE_URL");

function mapping(vendor: (typeof passwordManagerVendors)[number], name = secretName): PasswordManagerSecretMapping {
  return {
    environment: "local",
    service: "app",
    secretName: name,
    reference: { vendor, reference: `${vendor}:stable-reference` },
  };
}

describe("password-manager secret provider contracts", () => {
  it("keeps a contract for every supported vendor", () => {
    expect(Object.keys(passwordManagerVendorContracts)).toEqual([...passwordManagerVendors]);
    for (const vendor of passwordManagerVendors) {
      expect(passwordManagerVendorContracts[vendor].vendor).toBe(vendor);
      expect(passwordManagerVendorContracts[vendor].referenceFormat).not.toContain("value");
    }
  });

  it("fails safely when the required adapter is not configured", async () => {
    const provider = new PasswordManagerSecretProvider("local", "app", { mappings: [mapping("bitwarden")] });
    await expect(provider.get(secretName)).rejects.toBeInstanceOf(PasswordManagerAdapterUnconfiguredError);
  });

  it("rejects an unsupported adapter without invoking it", () => {
    expect(() =>
      createPasswordManagerAdapterRegistry([
        { vendor: "unsupported" as never, lookup: vi.fn<PasswordManagerAdapter["lookup"]>() },
      ]),
    ).toThrow(UnsupportedPasswordManagerAdapterError);
  });

  it("validates access before it asks an adapter", async () => {
    const lookup = vi.fn<PasswordManagerAdapter["lookup"]>();
    const provider = new PasswordManagerSecretProvider("local", "worker", {
      mappings: [mapping("bitwarden", SecretNameSchema.parse("OPENAI_API_KEY"))],
      adapters: createPasswordManagerAdapterRegistry([{ vendor: "bitwarden", lookup }]),
    });

    await expect(provider.get(SecretNameSchema.parse("OPENAI_API_KEY"))).rejects.toBeInstanceOf(Error);
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(passwordManagerVendors)("passes only the declared request to %s", async (vendor) => {
    const lookup = vi.fn<PasswordManagerAdapter["lookup"]>().mockResolvedValue({ kind: "value", value: "secret" });
    const provider = new PasswordManagerSecretProvider("local", "app", {
      mappings: [mapping(vendor)],
      adapters: createPasswordManagerAdapterRegistry([{ vendor, lookup }]),
    });

    await expect(provider.get(secretName)).resolves.toBe("secret");
    expect(lookup).toHaveBeenCalledWith({ secretName, reference: `${vendor}:stable-reference` });
  });

  it("normalizes missing, empty, and thrown adapter results", async () => {
    const cases = [
      ["missing", PasswordManagerSecretMissingError],
      ["empty", PasswordManagerSecretEmptyError],
      ["throws", PasswordManagerLookupError],
    ] as const;
    for (const [kind, errorType] of cases) {
      const lookup =
        kind === "throws"
          ? vi.fn<PasswordManagerAdapter["lookup"]>().mockRejectedValue(new Error("secret-value provider-token"))
          : vi
              .fn<PasswordManagerAdapter["lookup"]>()
              .mockResolvedValue(kind === "missing" ? { kind: "missing" } : { kind: "value", value: "" });
      const provider = new PasswordManagerSecretProvider("local", "app", {
        mappings: [mapping("doppler")],
        adapters: createPasswordManagerAdapterRegistry([{ vendor: "doppler", lookup }]),
      });

      await expect(provider.get(secretName)).rejects.toBeInstanceOf(errorType);
      await expect(provider.get(secretName)).rejects.not.toThrow(/secret-value|provider-token/u);
    }
  });

  it("normalizes malformed adapter results", async () => {
    const lookup = vi.fn<PasswordManagerAdapter["lookup"]>().mockResolvedValue({ kind: "unexpected" } as never);
    const provider = new PasswordManagerSecretProvider("local", "app", {
      mappings: [mapping("bitwarden")],
      adapters: createPasswordManagerAdapterRegistry([{ vendor: "bitwarden", lookup }]),
    });

    await expect(provider.get(secretName)).rejects.toBeInstanceOf(PasswordManagerLookupError);
  });

  it("reports adapter denial without exposing the reference", async () => {
    const sensitiveReference = "stable-reference-with-no-secret-value";
    const lookup = vi.fn<PasswordManagerAdapter["lookup"]>().mockResolvedValue({ kind: "denied" });
    const provider = new PasswordManagerSecretProvider("local", "app", {
      mappings: [{ ...mapping("hashicorp-vault"), reference: { vendor: "hashicorp-vault", reference: sensitiveReference } }],
      adapters: createPasswordManagerAdapterRegistry([{ vendor: "hashicorp-vault", lookup }]),
    });

    const error = await provider.get(secretName).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PasswordManagerSecretDeniedError);
    expect(String(error)).not.toContain(sensitiveReference);
  });

  it("does not expose a mutable adapter registry", () => {
    const registry = createPasswordManagerAdapterRegistry([]);
    expect(Object.isFrozen(registry)).toBe(true);
    expect(registry.get("bitwarden")).toBeUndefined();
  });
});
