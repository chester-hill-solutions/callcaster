import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { Input as Input$1, composeRenderProps } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Input({
  className,
  type,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Input$1,
    {
      type,
      "data-slot": "input",
      className: composeRenderProps(
        className,
        (className2) => cn(
          "h-10 w-full min-w-0 rounded-md border border-border bg-card px-3 py-2 text-base shadow-[0_2px_0_0_var(--border)] transition-colors duration-150 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className2
        )
      ),
      ...props
    }
  );
}

export { Input };
//# sourceMappingURL=chunk-6HSNWWYK.js.map
//# sourceMappingURL=chunk-6HSNWWYK.js.map