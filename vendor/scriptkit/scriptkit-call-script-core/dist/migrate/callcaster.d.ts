import { z } from "zod";
import { type CallcasterFlow, type ScriptDocument } from "../types.js";
export declare const callcasterWireBlockSchema: z.ZodObject<{
    id: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    blockType: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    body: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    options: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
    routingRules: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
}, z.core.$loose>;
export declare function migrateFromCallcasterFlow(flow: unknown): ScriptDocument;
export declare function serializeToCallcasterFlow(doc: ScriptDocument): CallcasterFlow;
