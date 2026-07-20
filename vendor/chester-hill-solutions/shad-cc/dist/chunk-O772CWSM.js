import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { TextArea, composeRenderProps } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Textarea({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    TextArea,
    {
      "data-slot": "textarea",
      className: composeRenderProps(
        className,
        (className2) => cn(
          "flex field-sizing-content min-h-16 w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-base shadow-[0_2px_0_0_var(--border)] transition-colors duration-150 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className2
        )
      ),
      ...props
    }
  );
}

export { Textarea };
//# sourceMappingURL=chunk-O772CWSM.js.map
//# sourceMappingURL=chunk-O772CWSM.js.map