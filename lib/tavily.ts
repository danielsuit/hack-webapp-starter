export type TavilyResult = {
  title: string;
  url: string;
  snippet: string;
  image_url?: string;
  raw_content?: string;
};

type TavilyApiResult = {
  title: string;
  url: string;
  content: string;
  raw_content?: string | null;
  score?: number;
};

type TavilyApiResponse = {
  results?: TavilyApiResult[];
  images?: Array<string | { url: string; description?: string }>;
  answer?: string;
};

export async function searchWayfair(
  query: string,
  options: { maxResults?: number } = {},
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn(
      "[tavily] TAVILY_API_KEY missing — returning mock Wayfair results. Add a free key from https://tavily.com to .env.local for real search.",
    );
    return mockResults(query, options.maxResults ?? 5);
  }

  const maxResults = options.maxResults ?? 8;

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: `${query} site:wayfair.com`,
      search_depth: "basic",
      include_domains: ["wayfair.com"],
      include_images: true,
      include_raw_content: true,
      max_results: maxResults,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = (await response.json()) as TavilyApiResponse;
  const results = data.results ?? [];

  return results
    .filter((r) => r.url.includes("wayfair.com") && r.url.includes("/pdp/"))
    .map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      raw_content: r.raw_content ?? undefined,
      image_url: extractFirstImage(r.raw_content) ?? undefined,
    }));
}

function extractFirstImage(rawContent?: string | null): string | undefined {
  if (!rawContent) return undefined;
  const match = rawContent.match(
    /https?:\/\/[^\s"'<>]+wfcdn\.com[^\s"'<>]*?\.(?:jpg|jpeg|png|webp)/i,
  );
  return match?.[0];
}

function mockResults(query: string, count: number): TavilyResult[] {
  const cleanQuery = query
    .toLowerCase()
    .replace(/\b(velvet|leather|wood|tufted|boucle|linen)\s+\1\b/g, "$1");
  const slug = cleanQuery.replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  const variants = [
    { brand: "Mercury Row", price: "$429", dims: "30 W x 32 D x 34 H" },
    { brand: "Latitude Run", price: "$589", dims: "32 W x 34 D x 36 H" },
    { brand: "Foundry Select", price: "$349", dims: "29 W x 30 D x 33 H" },
    { brand: "AllModern Studio", price: "$679", dims: "33 W x 35 D x 35 H" },
    { brand: "Wade Logan", price: "$499", dims: "31 W x 33 D x 34 H" },
  ];

  return variants.slice(0, count).map((v, i) => ({
    title: `${v.brand} ${cleanQuery}`,
    url: `https://www.wayfair.com/furniture/pdp/${slug}-${i + 1}.html`,
    snippet: `${v.brand} ${cleanQuery}. Price: ${v.price}. Dimensions: ${v.dims} in. Free shipping over $35. In stock.`,
    raw_content: `Price: ${v.price}. Dimensions: ${v.dims}. Brand: ${v.brand}. Available in multiple finishes. Returns within 30 days.`,
    image_url: undefined,
  }));
}
