import { NextResponse } from "next/server";
import { chatCompletionJSON } from "@/lib/sub-client";
import { ParseResponseSchema } from "@/lib/schemas";
import { PARSER_INSTRUCTIONS } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let payload: { imageDataUrl?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.imageDataUrl) {
    return NextResponse.json(
      { error: "Missing imageDataUrl" },
      { status: 400 },
    );
  }

  try {
    const output = await chatCompletionJSON({
      schema: ParseResponseSchema,
      schemaName: "style_profile_and_items",
      maxTokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PARSER_INSTRUCTIONS },
            { type: "image_url", image_url: { url: payload.imageDataUrl } },
          ],
        },
      ],
    });
    return NextResponse.json(output);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Parse failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
