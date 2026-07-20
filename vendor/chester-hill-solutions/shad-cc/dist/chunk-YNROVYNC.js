import * as React from 'react';

// src/hooks/use-mobile.ts
var MOBILE_BREAKPOINT = 768;
function getIsMobile() {
  if (typeof window === "undefined") {
    return void 0;
  }
  return window.innerWidth < MOBILE_BREAKPOINT;
}
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(getIsMobile);
  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return !!isMobile;
}

export { useIsMobile };
//# sourceMappingURL=chunk-YNROVYNC.js.map
//# sourceMappingURL=chunk-YNROVYNC.js.map