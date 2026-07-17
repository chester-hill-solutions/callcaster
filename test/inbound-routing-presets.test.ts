import { describe, expect, it } from "vitest";

import {
  INBOUND_ROUTING_RUNTIME_PRECEDENCE,
  buildInboundRoutingPresetPatch,
  inferInboundRoutingPreset,
  summarizeEffectiveInboundRouting,
  type InboundRoutingPresetApplication,
} from "../shared/inbound-routing-presets";

describe("inbound routing presets", () => {
  it.each<InboundRoutingPresetApplication>([
    { presetId: "agent" },
    {
      presetId: "agent",
      fallbackEmail: "fallback@example.com",
      audioName: "Agent fallback.mp3",
    },
    { presetId: "queue", queueId: 12 },
    { presetId: "automated_menu", scriptId: 34 },
    {
      presetId: "voicemail",
      notificationEmail: "calls@example.com",
      audioName: "Main greeting.mp3",
    },
    { presetId: "forward", phoneNumber: "+14165550123" },
    { presetId: "webhook_only" },
  ])("round-trips the $presetId canonical bundle", (application) => {
    const patch = buildInboundRoutingPresetPatch(application);

    expect(inferInboundRoutingPreset(patch)).toMatchObject({
      presetId: application.presetId,
      reasons: [],
    });
  });

  it("round-trips an agent with voicemail fallback", () => {
    const patch = buildInboundRoutingPresetPatch({
      presetId: "agent",
      fallbackEmail: " fallback@example.com ",
      audioName: " Agent fallback.mp3 ",
    });

    expect(patch).toEqual({
      handset_enabled: true,
      inbound_action: "fallback@example.com",
      inbound_audio: "Agent fallback.mp3",
      inbound_queue_id: null,
      inbound_script_id: null,
    });
    expect(inferInboundRoutingPreset(patch)).toEqual({
      presetId: "agent",
      reasons: [],
    });
    expect(summarizeEffectiveInboundRouting(patch)).toEqual({
      route: "agent",
      label: "Agent handset",
      detail: "Voicemail fallback: fallback@example.com",
    });
  });

  it("clears every competing route when applying a preset", () => {
    expect(
      buildInboundRoutingPresetPatch({
        presetId: "queue",
        queueId: 12,
      }),
    ).toEqual({
      handset_enabled: false,
      inbound_action: null,
      inbound_audio: null,
      inbound_queue_id: 12,
      inbound_script_id: null,
    });
  });

  it.each([
    {
      fields: { inbound_script_id: 1, inbound_queue_id: 2 },
      effectiveRoute: "automated_menu",
    },
    {
      fields: { inbound_queue_id: 2, handset_enabled: true },
      effectiveRoute: "queue",
    },
    {
      fields: { handset_enabled: true, inbound_action: "+14165550123" },
      effectiveRoute: "agent",
    },
    {
      fields: { handset_enabled: true, inbound_action: "webhook_only" },
      effectiveRoute: "agent",
    },
    {
      fields: {
        inbound_action: "calls@example.com",
        inbound_script_id: 1,
      },
      effectiveRoute: "automated_menu",
    },
  ])(
    "classifies conflicting legacy fields as Custom while reporting $effectiveRoute precedence",
    ({ fields, effectiveRoute }) => {
      const inference = inferInboundRoutingPreset(fields);

      expect(inference.presetId).toBe("custom");
      expect(inference.reasons.join(" ")).toContain(
        "Multiple routing destinations",
      );
      expect(summarizeEffectiveInboundRouting(fields).route).toBe(effectiveRoute);
    },
  );

  it("represents the runtime precedence explicitly", () => {
    expect(INBOUND_ROUTING_RUNTIME_PRECEDENCE).toEqual([
      "automated_menu",
      "queue",
      "agent",
      "forward",
      "voicemail",
      "fallback",
    ]);
  });

  it("classifies an empty legacy state as Custom with an actionable reason", () => {
    expect(inferInboundRoutingPreset({})).toEqual({
      presetId: "custom",
      reasons: ["Choose an inbound routing destination."],
    });
    expect(summarizeEffectiveInboundRouting({})).toEqual({
      route: "fallback",
      label: "Standard unavailable message",
      detail: null,
    });
  });

  it("reports caller ID rows as outbound-only", () => {
    expect(
      inferInboundRoutingPreset({
        type: "caller_id",
        inbound_action: "calls@example.com",
      }),
    ).toEqual({
      presetId: "custom",
      reasons: ["Caller ID numbers support outbound calling."],
    });
    expect(
      summarizeEffectiveInboundRouting({
        type: "caller_id",
        inbound_script_id: 10,
      }),
    ).toEqual({
      route: "outbound_only",
      label: "Outbound calling",
      detail: null,
    });
  });

  it("distinguishes voicemail email values from unrecognized actions", () => {
    expect(
      inferInboundRoutingPreset({
        inbound_action: "  calls@example.com ",
        inbound_audio: " greeting.mp3 ",
      }),
    ).toEqual({ presetId: "voicemail", reasons: [] });

    const inference = inferInboundRoutingPreset({
      inbound_action: "workspace-member",
    });
    expect(inference.presetId).toBe("custom");
    expect(inference.reasons).toContain(
      "Use a phone number, email, or webhook value for the inbound action.",
    );
  });

  it("flags a greeting that has no voicemail email", () => {
    const inference = inferInboundRoutingPreset({
      inbound_audio: "greeting.mp3",
    });

    expect(inference.presetId).toBe("custom");
    expect(inference.reasons).toContain(
      "A voicemail greeting needs a voicemail notification email.",
    );

    const handsetInference = inferInboundRoutingPreset({
      handset_enabled: true,
      inbound_audio: "greeting.mp3",
    });
    expect(handsetInference.presetId).toBe("custom");
    expect(handsetInference.reasons).toContain(
      "A voicemail greeting needs a voicemail notification email.",
    );
  });

  it("uses stable identifiers when queue and script names are missing", () => {
    expect(
      summarizeEffectiveInboundRouting(
        { inbound_queue_id: 42 },
        { queues: [{ id: 42, name: null }] },
      ),
    ).toMatchObject({ route: "queue", detail: "Queue #42" });
    expect(
      summarizeEffectiveInboundRouting(
        { inbound_script_id: 9 },
        { scripts: [] },
      ),
    ).toMatchObject({ route: "automated_menu", detail: "Script #9" });
  });

  it("recognizes webhook-only routing and clears voice destinations", () => {
    const patch = buildInboundRoutingPresetPatch({ presetId: "webhook_only" });

    expect(patch).toEqual({
      handset_enabled: false,
      inbound_action: "webhook_only",
      inbound_audio: null,
      inbound_queue_id: null,
      inbound_script_id: null,
    });
    expect(inferInboundRoutingPreset(patch)).toEqual({
      presetId: "webhook_only",
      reasons: [],
    });
    expect(summarizeEffectiveInboundRouting(patch)).toEqual({
      route: "webhook_only",
      label: "Webhook events",
      detail: null,
    });
  });

  it("rejects incomplete preset targets", () => {
    expect(() =>
      buildInboundRoutingPresetPatch({ presetId: "queue", queueId: 0 }),
    ).toThrow("Queue ID must be a positive integer");
    expect(() =>
      buildInboundRoutingPresetPatch({
        presetId: "voicemail",
        notificationEmail: "calls",
      }),
    ).toThrow("A valid voicemail notification email is required");
    expect(() =>
      buildInboundRoutingPresetPatch({
        presetId: "forward",
        phoneNumber: "extension 100",
      }),
    ).toThrow("A valid forwarding phone number is required");
    expect(() =>
      buildInboundRoutingPresetPatch({
        presetId: "agent",
        fallbackEmail: "calls",
      }),
    ).toThrow("A valid agent fallback email is required");
    expect(() =>
      buildInboundRoutingPresetPatch({
        presetId: "agent",
        audioName: "greeting.mp3",
      }),
    ).toThrow("An agent voicemail greeting needs a fallback email");
  });
});
