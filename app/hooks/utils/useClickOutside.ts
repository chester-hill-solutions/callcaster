import { useEffect, type RefObject } from "react";

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClose: () => void,
): void {
  /**
   * @effect Call onClose when a mousedown occurs outside the given element's ref.
   * @effect-deps onClose, ref (re-subscribes if either identity changes, keeping the handler current)
   * @effect-side-effects dom (document 'mousedown' listener; removed on cleanup)
   * @effect-why-not-loader Not data fetching — this is a DOM event subscription for detecting outside clicks.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, ref]);
}
