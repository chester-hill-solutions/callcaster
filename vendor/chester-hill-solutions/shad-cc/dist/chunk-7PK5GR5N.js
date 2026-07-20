import { cn } from './chunk-DN2AEEA2.js';
import { Slider as Slider$1, SliderTrack, SliderFill, SliderThumb } from 'react-aria-components';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

function Slider({
  className,
  ...props
}) {
  return /* @__PURE__ */ jsx(
    Slider$1,
    {
      className: cn(
        "group relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:min-h-40 data-vertical:w-auto data-vertical:flex-col",
        className
      ),
      "data-slot": "slider",
      ...props,
      children: ({ state }) => {
        return /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(
            SliderTrack,
            {
              "data-slot": "slider-track",
              className: "relative grow overflow-hidden rounded-md border border-border bg-muted select-none data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5",
              children: /* @__PURE__ */ jsx(
                SliderFill,
                {
                  "data-slot": "slider-range",
                  className: "absolute bg-primary select-none data-horizontal:h-full data-vertical:w-full"
                }
              )
            }
          ),
          state.values.map((_, index) => /* @__PURE__ */ jsx(
            SliderThumb,
            {
              "data-slot": "slider-thumb",
              index,
              className: "block size-4 shrink-0 rounded-sm border border-border bg-card shadow-[0_1px_0_0_var(--border)] transition-[color,box-shadow] duration-200 select-none not-dark:bg-clip-padding group-data-horizontal:top-[50%] group-data-vertical:left-[50%] hover:ring-4 hover:ring-ring/40 focus-visible:ring-4 focus-visible:ring-ring/40 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
            },
            index
          ))
        ] });
      }
    }
  );
}

export { Slider };
//# sourceMappingURL=chunk-7PK5GR5N.js.map
//# sourceMappingURL=chunk-7PK5GR5N.js.map