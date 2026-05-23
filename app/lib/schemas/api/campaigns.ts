import { z } from "zod";

const jsonFieldSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => {
    if (typeof value === "string") {
      return JSON.parse(value) as Record<string, unknown>;
    }
    return value;
  });

export const campaignPatchBodySchema = z.object({
  campaignData: jsonFieldSchema,
  campaignDetails: jsonFieldSchema,
});

export const campaignDeleteBodySchema = z.object({
  campaignId: z.union([z.string(), z.number()]),
});

export const campaignCreateBodySchema = z.object({
  campaignData: jsonFieldSchema,
});
