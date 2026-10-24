import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { simPersonas } from "../e2e/sim/personas";
import {
  assertValidSimPersonaCatalog,
  SimPersonaCatalogValidationError,
  validateSimPersonaCatalog,
} from "../e2e/sim/personas/validate";

type MutableCatalog = Record<string, Record<string, unknown>>;

function catalogFixture(): MutableCatalog {
  return structuredClone(simPersonas) as unknown as MutableCatalog;
}

function invalidCode(change: (catalog: MutableCatalog) => void): string[] {
  const catalog = catalogFixture();
  change(catalog);
  return validateSimPersonaCatalog(catalog).issues.map(({ code }) => code);
}

describe("SIM persona catalog validator", () => {
  it("accepts the real deeply-frozen catalog", () => {
    const result = validateSimPersonaCatalog(simPersonas);

    expect(result).toEqual({
      valid: true,
      personaCount: 3,
      personaKeys: ["person-a", "person-b", "person-c"],
      issues: [],
    });
    expect(() => assertValidSimPersonaCatalog(simPersonas)).not.toThrow();
  });

  it("requires an object catalog", () => {
    expect(validateSimPersonaCatalog(null).issues.map(({ code }) => code)).toEqual(["catalog-not-object"]);
  });

  it("requires exactly the supported persona keys and grammar", () => {
    const codes = invalidCode((catalog) => {
      delete catalog["person-c"];
      catalog["person-d"] = catalog["person-a"];
      catalog["person-d"].emailLocalPart = "person.d";
    });
    expect(codes).toEqual(expect.arrayContaining(["persona-key-grammar", "persona-keys"]));
  });

  it("rejects runtime, secret, provider, recipient, and arbitrary fields", () => {
    const codes = invalidCode((catalog) => {
      catalog["person-a"].password = "not-a-password";
      catalog["person-a"].phoneNumber = "+15555550100";
      catalog["person-a"].providerReference = "provider";
      catalog["person-a"].workspaceId = "database-id";
      catalog["person-a"].environment = "local";
      catalog["person-a"].runtimeIdentity = "runtime";
      catalog["person-a"].twimlIdentity = "twiml";
      catalog["person-a"].url = "https://example.test";
      catalog["person-a"].token = "token";
    });
    expect(codes).toContain("persona-fields");
  });

  it("validates email local-parts and duplicate local-parts", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].emailLocalPart = "bad..local"; })).toContain("email-local-part");
    expect(invalidCode((catalog) => { catalog["person-a"].emailLocalPart = "123e4567-e89b-12d3-a456-426614174000"; })).toContain("email-local-part");
    expect(invalidCode((catalog) => { catalog["person-b"].emailLocalPart = "person.a"; })).toContain("duplicate-email-local-part");
  });

  it("requires a non-empty logical workspace name", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].workspaceName = "   "; })).toContain("workspace-name");
  });

  it("rejects unsafe values in allowed workspace fields", () => {
    for (const value of [
      "https://example.test/workspace",
      "+15555550100",
      "123e4567-e89b-12d3-a456-426614174000",
      "workspace-password-secret",
    ]) {
      expect(invalidCode((catalog) => { catalog["person-a"].workspaceName = value; })).toContain("workspace-name");
    }
  });

  it("allows only owner and member roles", () => {
    expect(invalidCode((catalog) => { catalog["person-b"].role = "agent"; })).toContain("role");
  });

  it("allows only known capabilities", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].capabilities = ["workspace.read", "calls.start"]; })).toContain("capability");
  });

  it("allows only the current SIM SMS flow", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].allowedFlows = ["voice-ivr"]; })).toContain("flow");
  });

  it("allows only known manifest identifiers", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].ownsManifests = ["unknown-manifest"]; })).toContain("manifest");
  });

  it("accepts only logical SIM credential references", () => {
    expect(invalidCode((catalog) => { catalog["person-a"].credentialName = "DATABASE_URL"; })).toContain("credential-name");
  });

  it("does not include rejected arbitrary values in validation output", () => {
    const catalog = catalogFixture();
    catalog["person-a"].password = "secret-value";
    const result = validateSimPersonaCatalog(catalog);
    expect(JSON.stringify(result)).not.toContain("secret-value");
    expect(result.personaKeys).toEqual(["person-a", "person-b", "person-c"]);
  });

  it("checks the checked-in catalog through the local CLI", () => {
    const output = execFileSync("npm", ["run", "sim:catalog:check", "--silent"], { encoding: "utf8" });
    expect(output.trim()).toBe("SIM persona catalog valid: 3 personas (person-a, person-b, person-c)");
  });

  it("throws a stable safe error for invalid catalogs", () => {
    const catalog = catalogFixture();
    catalog["person-a"].token = "sensitive-token";
    expect(() => assertValidSimPersonaCatalog(catalog)).toThrow(SimPersonaCatalogValidationError);
    try {
      assertValidSimPersonaCatalog(catalog);
    } catch (error) {
      expect(String(error)).not.toContain("sensitive-token");
      expect(String(error)).toContain("persona-fields");
    }
  });
});
