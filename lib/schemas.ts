import { z } from "zod";

export const StyleProfileSchema = z.object({
  palette: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 dominant colors as hex codes, e.g. '#D4A574'"),
  materials: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe(
      "Specific materials visible. Examples: 'walnut', 'cream boucle', 'aged brass', 'natural linen'. Be specific, not generic.",
    ),
  era_or_style: z
    .string()
    .describe(
      "One label like 'mid-century modern', 'japandi', 'dark academia', 'coastal contemporary'",
    ),
  formality: z.enum(["casual", "relaxed", "refined", "formal"]),
  style_keywords: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe(
      "3-5 descriptive adjectives, e.g. 'warm', 'minimal', 'organic', 'layered'",
    ),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const DetectedItemSchema = z.object({
  slot_id: z
    .string()
    .describe("Unique slug like 'sofa', 'coffee_table', 'floor_lamp_1'"),
  category: z
    .string()
    .describe(
      "Furniture category, e.g. 'sectional sofa', 'area rug', 'floor lamp'",
    ),
  descriptors: z
    .array(z.string())
    .min(2)
    .max(5)
    .describe(
      "Concrete visual descriptors: '8ft length', 'low-profile', 'tufted cushions', 'tapered wood legs'",
    ),
  price_band: z.enum(["budget", "mid", "premium"]),
  approximate_dimensions: z
    .string()
    .optional()
    .describe("Rough size if estimable, e.g. '~80 inches wide'"),
});
export type DetectedItem = z.infer<typeof DetectedItemSchema>;

export const ParseResponseSchema = z.object({
  style_profile: StyleProfileSchema,
  detected_items: z.array(DetectedItemSchema).min(1).max(8),
});
export type ParseResponse = z.infer<typeof ParseResponseSchema>;

export const CandidateSchema = z.object({
  product_url: z.string().describe("Wayfair product URL, e.g. https://www.wayfair.com/..."),
  image_url: z.string().optional().describe("Direct image URL if available"),
  title: z.string(),
  price_usd: z.number(),
  dimensions: z.string().optional(),
  match_rationale: z
    .string()
    .describe("One sentence why this matches the slot"),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const ShopResponseSchema = z.object({
  slot_id: z.string(),
  candidates: z.array(CandidateSchema).max(3),
});
export type ShopResponse = z.infer<typeof ShopResponseSchema>;

export const FinalCartItemSchema = z.object({
  slot_id: z.string(),
  selected: CandidateSchema,
  reason: z.string().describe("One sentence: why this candidate over others"),
});
export type FinalCartItem = z.infer<typeof FinalCartItemSchema>;

export const CurateResponseSchema = z.object({
  cart: z.array(FinalCartItemSchema),
  total_price_usd: z.number(),
  coherence_notes: z
    .string()
    .describe(
      "2-3 sentences on how well the cart hangs together stylistically",
    ),
});
export type CurateResponse = z.infer<typeof CurateResponseSchema>;
