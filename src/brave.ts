import { AuthError, SearchError } from "./errors.js";
import { getJson } from "./http.js";
import type { PluginConfig } from "./options.js";
import { resolveEnvTemplate } from "./options.js";
import { type SearchResultItem, parsePublishedTimestamp } from "./types.js";

export const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  page_age?: string;
  extra_snippets?: string[];
};

type BraveApiResponse = {
  web?: {
    results?: BraveWebResult[];
  };
  message?: string;
  error?: string;
};

export type BraveAuthResolver = () => Promise<string | undefined>;

export async function resolveBraveApiKey(
  configuredKey: string | undefined,
  fallbackResolver?: BraveAuthResolver,
): Promise<string> {
  const fromConfig = resolveEnvTemplate(configuredKey);
  if (fromConfig) return fromConfig;

  if (process.env.BRAVE_SEARCH_API_KEY) return process.env.BRAVE_SEARCH_API_KEY;
  if (process.env.BRAVE_API_KEY) return process.env.BRAVE_API_KEY;

  if (fallbackResolver) {
    const fromIntegration = await fallbackResolver();
    if (fromIntegration) return fromIntegration;
  }

  throw new AuthError(
    "Brave Search API key not found.",
    "Set brave.apiKey in plugin options, set BRAVE_SEARCH_API_KEY, or run `/connect` to sign in to Brave Search.",
  );
}

export async function braveSearch(
  apiKey: string,
  query: string,
  config: PluginConfig["brave"],
  signal?: AbortSignal,
): Promise<readonly SearchResultItem[]> {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("text_decorations", "false");
  url.searchParams.set("result_filter", "web");

  url.searchParams.set("count", String(config.count));
  if (config.country) url.searchParams.set("country", config.country);
  if (config.searchLang) url.searchParams.set("search_lang", config.searchLang);
  if (config.safesearch) url.searchParams.set("safesearch", config.safesearch);
  if (config.freshness) url.searchParams.set("freshness", config.freshness);

  const json = await getJson<BraveApiResponse>(url.toString(), {
    headers: {
      "X-Subscription-Token": apiKey,
    },
    signal,
    label: "Brave Search API",
    hintForStatus: (status) =>
      status === 401 || status === 403
        ? "Check BRAVE_SEARCH_API_KEY or brave.apiKey in plugin options."
        : status === 429
          ? "Brave Search API rate limit or quota exceeded."
          : undefined,
  });

  const items = json.web?.results ?? [];
  const results: SearchResultItem[] = [];

  for (const item of items) {
    if (!item.url) continue;
    const published = parsePublishedTimestamp(item.page_age);
    const content = item.description ?? item.extra_snippets?.[0];
    results.push({
      url: item.url,
      ...(item.title ? { title: item.title } : {}),
      ...(content ? { content } : {}),
      time: {
        ...(published !== undefined ? { published } : {}),
      },
    });
  }

  return results;
}
