import type { RoutingTarget } from "@chester-hill-solutions/scriptkit-call-script-react";

/** Sentinel for "no routing target" — Radix Select rejects empty-string values. */
export const NO_ROUTING_TARGET = "__none__";

export type RoutingOption = { value: string; label: string };

export function routingOptionsFor(
  routingTargets: RoutingTarget[],
  noTargetLabel = "(no target)",
): RoutingOption[] {
  return [
    { value: NO_ROUTING_TARGET, label: noTargetLabel },
    ...routingTargets.map((target) => ({
      value: target.id,
      label:
        target.kind === "block"
          ? `${target.pageTitle} — ${target.label}`
          : target.label,
    })),
  ];
}
