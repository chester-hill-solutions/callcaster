// src/components/ui/collapsible.tsx
import {
  DisclosurePanel as CollapsibleContentPrimitive,
  Disclosure as CollapsiblePrimitive,
  Button as CollapsibleTriggerPrimitive
} from "react-aria-components";
import { jsx } from "react/jsx-runtime";
function Collapsible({ ...props }) {
  return /* @__PURE__ */ jsx(CollapsiblePrimitive, { "data-slot": "collapsible", ...props });
}
function CollapsibleTrigger({ ...props }) {
  return /* @__PURE__ */ jsx(
    CollapsibleTriggerPrimitive,
    {
      slot: "trigger",
      "data-slot": "collapsible-trigger",
      ...props
    }
  );
}
function CollapsibleContent({ ...props }) {
  return /* @__PURE__ */ jsx(CollapsibleContentPrimitive, { "data-slot": "collapsible-content", ...props });
}

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent
};
//# sourceMappingURL=chunk-5LXYQVKF.js.map