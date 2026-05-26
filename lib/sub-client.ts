import { z } from "zod";

const SUBC_URL = "https://api.subconscious.dev/v1/chat/completions";
const MODEL = "subconscious/tim-qwen3.6-27b";

export type ImageInput = { dataUrl: string };

export type TextOrImage =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type UserMessage = {
  role: "user";
  content: string | TextOrImage[];
};

export type StructuredCallOptions<S extends z.ZodType> = {
  schema: S;
  schemaName: string;
  messages: UserMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  enableThinking?: boolean;
};

export async function chatCompletionJSON<S extends z.ZodType>(
  options: StructuredCallOptions<S>,
): Promise<z.infer<S>> {
  const apiKey = process.env.SUBCONSCIOUS_API_KEY;
  if (!apiKey) {
    throw new Error("Missing SUBCONSCIOUS_API_KEY");
  }

  const jsonSchema = z.toJSONSchema(options.schema, {
    target: "draft-2020-12",
    unrepresentable: "any",
  });

  const messages: Array<{ role: string; content: unknown }> = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  for (const msg of options.messages) {
    messages.push({ role: msg.role, content: msg.content });
  }

  const body = {
    model: MODEL,
    messages,
    max_tokens: options.maxTokens ?? 2000,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: options.schemaName,
        schema: jsonSchema,
      },
    },
    chat_template_kwargs: {
      enable_thinking: options.enableThinking ?? false,
    },
  };

  const response = await fetch(SUBC_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Subconscious ${response.status}: ${text.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string };
      finish_reason?: string;
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Subconscious returned no content");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripPreamble(content));
  } catch {
    throw new Error(
      `Subconscious response was not JSON. First 200 chars: ${content.slice(0, 200)}`,
    );
  }

  return options.schema.parse(parsedJson);
}

function stripPreamble(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return trimmed;
  const firstBrace = trimmed.search(/[{\[]/);
  if (firstBrace === -1) return trimmed;
  return trimmed.slice(firstBrace);
}

export function dataUrlToImageBlock(dataUrl: string): TextOrImage {
  return { type: "image_url", image_url: { url: dataUrl } };
}
