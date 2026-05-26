import { tool } from "ai";
import { z } from "zod";

const DEMO_PRODUCTS = [
  {
    id: "wf-demo-1",
    name: "Carmel Upholstered Sofa",
    category: "Living Room Furniture",
    price: 899,
    currency: "USD",
    style: "modern",
    availability: "demo data",
  },
  {
    id: "wf-demo-2",
    name: "Auburn Extendable Dining Table",
    category: "Dining Room Furniture",
    price: 749,
    currency: "USD",
    style: "transitional",
    availability: "demo data",
  },
  {
    id: "wf-demo-3",
    name: "Linden Platform Bed",
    category: "Bedroom Furniture",
    price: 529,
    currency: "USD",
    style: "minimal",
    availability: "demo data",
  },
];

function getWayfairSearchUrl(query: string, limit: number) {
  const explicitSearchUrl = process.env.WAYFAIR_API_SEARCH_URL;
  const baseUrl = process.env.WAYFAIR_API_BASE_URL;

  if (!explicitSearchUrl && !baseUrl) {
    return null;
  }

  const url = new URL(explicitSearchUrl ?? "/products/search", baseUrl);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(limit));
  return url;
}

function getWayfairHeaders() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const apiKey = process.env.WAYFAIR_API_KEY;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export const searchWayfairProducts = tool({
  description:
    "Search Wayfair products by keyword, room, style, category, or furniture need.",
  inputSchema: z.object({
    query: z.string().describe("Search query, e.g. blue velvet sofa"),
    limit: z.number().min(1).max(20).optional().describe("Maximum products"),
  }),
  execute: async ({ query, limit = 8 }) => {
    const url = getWayfairSearchUrl(query, limit);

    if (!url) {
      return {
        query,
        source: "demo-data",
        note: "Set WAYFAIR_API_BASE_URL or WAYFAIR_API_SEARCH_URL, plus WAYFAIR_API_KEY if required, to call a real Wayfair endpoint.",
        results: DEMO_PRODUCTS.slice(0, limit),
      };
    }

    const response = await fetch(url, {
      headers: getWayfairHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        query,
        source: "wayfair-api",
        error: `Wayfair API returned ${response.status}`,
      };
    }

    return {
      query,
      source: "wayfair-api",
      results: await response.json(),
    };
  },
});
