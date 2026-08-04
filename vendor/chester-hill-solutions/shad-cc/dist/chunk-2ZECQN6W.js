import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { Label as Label$1, LabelContext } from 'react-aria-components';
import { jsx } from 'react/jsx-runtime';

function Label({ className, htmlFor, slot, ...props }) {
  const label = /* @__PURE__ */ jsx(
    Label$1,
    {
      "data-slot": "label",
      className: cn(
        "flex items-center gap-2 font-heading text-sm leading-none font-semibold select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-data-disabled:opacity-50",
        className
      ),
      ...props,
      htmlFor,
      slot
    }
  );
  if (htmlFor && slot === void 0) {
    return /* @__PURE__ */ jsx(LabelContext.Provider, { value: null, children: label });
  }
  return label;
}

export { Label };
//# sourceMappingURL=chunk-2ZECQN6W.js.map
//# sourceMappingURL=chunk-2ZECQN6W.js.map