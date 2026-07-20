import { cn } from './chunk-DN2AEEA2.js';
import * as React from 'react';
import { ProgressBar, Label } from 'react-aria-components';
import { jsx, jsxs } from 'react/jsx-runtime';

var ProgressContext = React.createContext(null);
function useProgress() {
  const context = React.useContext(ProgressContext);
  if (!context) {
    throw new Error("useProgress must be used within a Progress.");
  }
  return context;
}
function ProgressContent({
  children,
  percentage,
  isIndeterminate,
  valueText
}) {
  const context = React.useMemo(
    () => ({ percentage, isIndeterminate, valueText }),
    [percentage, isIndeterminate, valueText]
  );
  return /* @__PURE__ */ jsxs(ProgressContext, { value: context, children: [
    children,
    /* @__PURE__ */ jsx(ProgressTrack, { children: /* @__PURE__ */ jsx(ProgressIndicator, {}) })
  ] });
}
function Progress({
  className,
  children,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    ProgressBar,
    {
      "data-slot": "progress",
      className: cn("flex flex-wrap gap-3", className),
      ...props,
      children: ({ percentage, valueText, isIndeterminate }) => /* @__PURE__ */ jsx(
        ProgressContent,
        {
          percentage,
          valueText,
          isIndeterminate,
          children
        }
      )
    }
  );
}
function ProgressTrack({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "relative flex h-2 w-full items-center overflow-x-hidden rounded-md border border-border bg-muted",
        className
      ),
      "data-slot": "progress-track",
      ...props
    }
  );
}
function ProgressIndicator({
  className,
  style,
  ...props
}) {
  const { percentage, isIndeterminate } = useProgress();
  return /* @__PURE__ */ jsx(
    "span",
    {
      "data-slot": "progress-indicator",
      className: cn("h-full bg-primary transition-all", className),
      style: {
        ...style,
        width: `${isIndeterminate ? 100 : percentage ?? 0}%`
      },
      ...props
    }
  );
}
function ProgressLabel({ className, ...props }) {
  return /* @__PURE__ */ jsx(
    Label,
    {
      className: cn("text-sm font-medium", className),
      "data-slot": "progress-label",
      ...props
    }
  );
}
function ProgressValue({
  className,
  children,
  ...props
}) {
  const { valueText } = useProgress();
  return /* @__PURE__ */ jsx(
    "span",
    {
      className: cn(
        "ml-auto text-sm text-muted-foreground tabular-nums",
        className
      ),
      "data-slot": "progress-value",
      ...props,
      children: children && valueText != null ? children(valueText) : valueText
    }
  );
}

export { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue };
//# sourceMappingURL=chunk-C6TS27RO.js.map
//# sourceMappingURL=chunk-C6TS27RO.js.map