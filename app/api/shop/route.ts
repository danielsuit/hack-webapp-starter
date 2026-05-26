import { NextResponse } from "next/server";
import { chatCompletionJSON } from "@/lib/sub-client";
import { ShopResponseSchema, type DetectedItem } from "@/lib/schemas";
import { SHOPPER_INSTRUCTIONS } from "@/lib/prompts";
import { searchWayfair } from "@/lib/tavily";

export const runtime = "nodejs";
export const maxDuration = 120;

function buildSearchQuery(item: DetectedItem): string {
  const top = item.descriptors.slice(0, 2).join(" ");
  return `${top} ${item.category}`.trim();
}

export async function POST(req: Request) {
  let payload: { item?: DetectedItem; style_context?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { item, style_context } = payload;
  if (!item || !item.slot_id) {
    return NextResponse.json({ error: "Missing item" }, { status: 400 });
  }

  let searchResults;
  try {
    searchResults = await searchWayfair(buildSearchQuery(item), {
      maxResults: 5,
    });
  } catch (error) {
    return NextResponse.json(
      {
        slot_id: item.slot_id,
        error: error instanceof Error ? error.message : "Search failed",
      },
      { status: 502 },
    );
  }

  if (searchResults.length === 0) {
    return NextResponse.json(
      {
        slot_id: item.slot_id,
        error: "No Wayfair results for this slot",
      },
      { status: 404 },
    );
  }

  const trimmed = searchResults.map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet?.slice(0, 400) ?? "",
    image_url: r.image_url,
    raw_content: r.raw_content?.slice(0, 600),
  }));

  try {
    const output = await chatCompletionJSON({
      schema: ShopResponseSchema,
      schemaName: "shop_result",
      maxTokens: 2000,
      messages: [
        {
          role: "user",
          content: SHOPPER_INSTRUCTIONS({
            category: item.category,
            descriptors: item.descriptors,
            price_band: item.price_band,
            style_context: style_context ?? "",
            search_results: trimmed,
          }),
        },
      ],
    });

    output.slot_id = item.slot_id;

    for (const candidate of output.candidates) {
      if (!candidate.image_url) {
        const match = trimmed.find((r) => r.url === candidate.product_url);
        if (match?.image_url) candidate.image_url = match.image_url;
      }
    }

    return NextResponse.json(output);
  } catch (error) {
    return NextResponse.json(
      {
        slot_id: item.slot_id,
        error: error instanceof Error ? error.message : "Shop failed",
      },
      { status: 500 },
    );
  }
}
