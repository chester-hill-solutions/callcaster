import { Disclosure, Button, DisclosurePanel } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

// src/components/ui/collapsible.tsx
function Collapsible({ ...props }) {
  return /* @__PURE__ */ jsx(Disclosure, { "data-slot": "collapsible", ...props });
}
function CollapsibleTrigger({ ...props }) {
  return /* @__PURE__ */ jsx(
    Button,
    {
      slot: "trigger",
      "data-slot": "collapsible-trigger",
      ...props
    }
  );
}
function CollapsibleContent({ ...props }) {
  return /* @__PURE__ */ jsx(DisclosurePanel, { "data-slot": "collapsible-content", ...props });
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
//# sourceMappingURL=chunk-5LXYQVKF.js.map
//# sourceMappingURL=chunk-5LXYQVKF.js.map