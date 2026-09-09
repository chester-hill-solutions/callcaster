import { describe, expect, it } from "vitest";
import { closingIssueNumbers } from "../scripts/issue-closing-references.mjs";

describe("closing issue references for project status", () => {
  it("finds closing references in a PR body and commit messages", () => {
    expect(closingIssueNumbers("Closes #1697\nRelated #1748\nfix: #1698\nResolved #1697", "chester-hill-solutions/callcaster"))
      .toEqual([1697, 1698]);
  });
  it("accepts qualified local references and excludes other repositories", () => {
    expect(closingIssueNumbers("Fixes chester-hill-solutions/callcaster#12\nCloses https://github.com/chester-hill-solutions/callcaster/issues/13\nCloses someone/else#14\nResolves https://github.com/someone/else/issues/15", "chester-hill-solutions/callcaster"))
      .toEqual([12, 13]);
  });
  it("does nothing for references without a closing keyword", () => {
    expect(closingIssueNumbers("Refs #1697, related to #1698. Fixed the spacing.", "chester-hill-solutions/callcaster"))
      .toEqual([]);
  });
});
