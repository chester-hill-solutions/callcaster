import { cn } from './chunk-DN2AEEA2.js';
import { Keyboard } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Kbd({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Keyboard,
    {
      "data-slot": "kbd",
      className: cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm border border-border bg-muted px-1 font-mono text-xs font-medium text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)] select-none in-data-[slot=input-group]:bg-input in-data-[slot=tooltip-content]:border-transparent in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background in-data-[slot=tooltip-content]:shadow-none dark:in-data-[slot=tooltip-content]:bg-background/10 [&_svg:not([class*='size-'])]:size-3",
        className
      ),
      ...props
    }
  );
}
function KbdGroup({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Keyboard,
    {
      "data-slot": "kbd-group",
      className: cn("inline-flex items-center gap-1", className),
      ...props
    }
  );
}

export { Kbd, KbdGroup };
//# sourceMappingURL=chunk-RTPASLQJ.js.map
//# sourceMappingURL=chunk-RTPASLQJ.js.map