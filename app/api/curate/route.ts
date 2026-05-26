import { NextResponse } from "next/server";
import { chatCompletionJSON } from "@/lib/sub-client";
import { CurateResponseSchema, type ShopResponse } from "@/lib/schemas";
import { CURATOR_INSTRUCTIONS } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let payload: { imageDataUrl?: string; shopResults?: ShopResponse[] };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.imageDataUrl || !payload.shopResults?.length) {
    return NextResponse.json(
      { error: "Missing imageDataUrl or shopResults" },
      { status: 400 },
    );
  }

  try {
    const output = await chatCompletionJSON({
      schema: CurateResponseSchema,
      schemaName: "final_cart",
      maxTokens: 2500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${CURATOR_INSTRUCTIONS}\n\nCandidate products by slot (JSON):\n${JSON.stringify(payload.shopResults, null, 2)}`,
            },
            { type: "image_url", image_url: { url: payload.imageDataUrl } },
          ],
        },
      ],
    });

    const recomputedTotal = output.cart.reduce(
      (sum, item) => sum + (item.selected.price_usd ?? 0),
      0,
    );
    if (Math.abs(recomputedTotal - output.total_price_usd) > 1) {
      output.total_price_usd = Math.round(recomputedTotal * 100) / 100;
    }

    return NextResponse.json(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Curate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
