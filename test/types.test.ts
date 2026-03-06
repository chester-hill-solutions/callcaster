import { describe, expect, test } from "vitest";

import { generateSurveyLink, WorkspaceTableNames } from "../app/lib/types";

describe("types runtime exports", () => {
  test("WorkspaceTableNames enum contains expected values", () => {
    expect(WorkspaceTableNames.Audience).toBe("audiences");
    expect(WorkspaceTableNames.Campaign).toBe("campaigns");
    expect(WorkspaceTableNames.Contact).toBe("contacts");
  });

  test("generateSurveyLink encodes contactId and surveyId", () => {
    const link = generateSurveyLink(123, "abc", "http://localhost");
    expect(link.startsWith("http://localhost/?q=")).toBe(true);
    const encoded = link.split("q=")[1];
    expect(atob(encoded)).toBe("123:abc");
  });
});

