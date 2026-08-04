import { cn } from './chunk-DN2AEEA2.js';
import { Separator as Separator$1 } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Separator({
  className,
  orientation = "horizontal",
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Separator$1,
    {
      "data-slot": "separator",
      orientation,
      className: cn(
        "block shrink-0 border-0 bg-border aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=vertical]:w-px aria-[orientation=vertical]:self-stretch [:is(hr)]:h-px [:is(hr)]:w-full",
        className
      ),
      ...props
    }
  );
}

export { Separator };
//# sourceMappingURL=chunk-RDPOVP7H.js.map
//# sourceMappingURL=chunk-RDPOVP7H.js.map