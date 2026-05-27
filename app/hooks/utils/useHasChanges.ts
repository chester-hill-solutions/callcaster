import { useMemo } from "react";
import { deepEqual } from "@/lib/utils";

export function useHasChanges<T>(
  current: T,
  baseline: T,
  normalize?: (value: T) => T,
): boolean {
  return useMemo(() => {
    const left = normalize ? normalize(current) : current;
    const right = normalize ? normalize(baseline) : baseline;
    return !deepEqual(left, right);
  }, [baseline, current, normalize]);
}
