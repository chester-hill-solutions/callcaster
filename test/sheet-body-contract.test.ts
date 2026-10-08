import { describe, expect, test } from "vitest";
import { checkSheetBodyContract } from "../scripts/lib/sheet-body-contract.mjs";

const imports = `import { SheetContent, SheetBody, SheetHeader, SheetFooter } from "@/components/ui/sheet";`;
function errors(jsx: string) {
  return checkSheetBodyContract(`${imports}\nconst Example = () => (${jsx});`);
}

describe("sheet body contract", () => {
  test.each([
    "<SheetContent><div>New body</div></SheetContent>",
    "<SheetContent>{body}</SheetContent>",
    "<SheetContent><SheetHeader>Title</SheetHeader>Body</SheetContent>",
    '<SheetContent><form><input name="name" /></form></SheetContent>',
    "<SheetContent>{open && <div>Flush body</div>}</SheetContent>",
    "<SheetContent><SheetBody>Safe</SheetBody>{open ? <div>Flush</div> : null}</SheetContent>",
    "<SheetContent {...props} />",
    '<SheetContent><SheetBody className="[padding-left:0]">Flush</SheetBody></SheetContent>',
    '<SheetContent><SheetBody className="px-0">Flush</SheetBody></SheetContent>',
    '<SheetContent><SheetBody className="sm:px-0">Flush</SheetBody></SheetContent>',
    "<SheetContent><SheetBody style={{paddingLeft: 0}}>Flush</SheetBody></SheetContent>",
    "<SheetContent><SheetBody {...props}>Unknown padding</SheetBody></SheetContent>",
    "<SheetContent><SheetBody inset={chosenInset}>Unknown inset</SheetBody></SheetContent>",
  ])("rejects flush or unknown body content: %s", (jsx) => {
    expect(errors(jsx).length).toBeGreaterThan(0);
  });

  test.each([
    "<SheetContent><SheetHeader>Title</SheetHeader><SheetBody>Body</SheetBody><SheetFooter>Save</SheetFooter></SheetContent>",
    '<SheetContent><form><input type="hidden" name="intent" /><SheetBody><input name="name" /></SheetBody><SheetFooter>Save</SheetFooter></form></SheetContent>',
    '<SheetContent><SheetBody inset="none"><Navigation /></SheetBody></SheetContent>',
    '<SheetContent><SheetBody inset="navigation"><Navigation /></SheetBody></SheetContent>',
    "<SheetContent><>{open ? <SheetBody>{body}</SheetBody> : null}</></SheetContent>",
    "<SheetContent>{open && (<SheetBody>{body}</SheetBody>)}</SheetContent>",
    '<SheetContent><SheetBody className="space-y-4" style={{height: 200}}>Body</SheetBody></SheetContent>',
  ])("accepts explicit body slots: %s", (jsx) => {
    expect(errors(jsx)).toEqual([]);
  });

  test("rejects bypassing the local body contract through a direct vendor import", () => {
    expect(
      checkSheetBodyContract(
        'import { SheetContent } from "@chester-hill-solutions/shad-cc/sheet"; const Sheet = () => <SheetContent><div>Flush</div></SheetContent>;',
      ),
    ).toHaveLength(1);
  });

  test("resolves multiline import aliases instead of unrelated component names", () => {
    const source = `import {
      SheetContent as Drawer,
      SheetBody as Body,
      SheetHeader as Header,
    } from "../ui/sheet";
    const Good = () => <Drawer><Header>Title</Header><Body>Body</Body></Drawer>;
    const Bad = () => <Drawer><div>Flush</div></Drawer>;
    const Other = () => <SheetContent><div>Not the imported sheet</div></SheetContent>;`;
    const failures = checkSheetBodyContract(source, "aliased.tsx");
    expect(failures).toHaveLength(2);
    expect(failures.every((failure) => failure.line === 7)).toBe(true);
  });

  test("recognizes namespace imports and the SheetPanel escape hatch", () => {
    expect(
      checkSheetBodyContract(`import * as UI from "@/components/ui/sheet";
      const Bad = () => <UI.SheetPanel><div>Flush</div></UI.SheetPanel>;`),
    ).toHaveLength(2);
    expect(
      checkSheetBodyContract(`import * as UI from "@/components/ui/sheet";
      const Good = () => <UI.SheetContent><UI.SheetBody>Body</UI.SheetBody></UI.SheetContent>;`),
    ).toEqual([]);
  });

  test.each(["SheetHeader", "SheetFooter", "SheetBody"])(
    "rejects double-padded %s within a body",
    (slot) => {
      expect(
        errors(
          `<SheetContent><SheetBody><form><${slot}>Nested</${slot}></form></SheetBody></SheetContent>`,
        ),
      ).toHaveLength(1);
    },
  );
});
