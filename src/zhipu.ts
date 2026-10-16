import { AuthError, SearchError } from "./errors.js";
import { postJson } from "./http.js";
import type { PluginConfig } from "./options.js";
import { resolveEnvTemplate } from "./options.js";
import { type SearchResultItem, parsePublishedTimestamp } from "./types.js";
import { zhipuMcpSearch } from "./zhipu-mcp.js";

export const OFFICIAL_ZHIPU_URL = "https://open.bigmodel.cn/api/paas/v4/web_search";

type ZhipuSearchItem = {
  title?: string;
  content?: string;
  link?: string;
  media?: string;
  publish_date?: string;
};

type ZhipuApiResponse = {
  search_result?: ZhipuSearchItem[];
  error?: {
    code?: string | number;
    message?: string;
  };
};

export type ZhipuAuthResolver = () => Promise<string | undefined>;

export async function resolveZhipuApiKey(
  configuredKey: string | undefined,
  fallbackResolver?: ZhipuAuthResolver,
): Promise<string> {
  const fromConfig = resolveEnvTemplate(configuredKey);
  if (fromConfig) return fromConfig;

  if (process.env.ZHIPU_API_KEY) return process.env.ZHIPU_API_KEY;

  if (fallbackResolver) {
    const fromIntegration = await fallbackResolver();
    if (fromIntegration) return fromIntegration;
  }

  throw new AuthError(
    "Zhipu API key not found.",
    "Set zhipu.apiKey in plugin options, set ZHIPU_API_KEY, or run `/connect` to sign in to Zhipu AI.",
  );
}

export async function zhipuSearch(
  apiKey: string,
  query: string,
  config: PluginConfig["zhipu"],
  signal?: AbortSignal,
): Promise<readonly SearchResultItem[]> {
  if (config.searchEngine === "search_mcp") {
    return zhipuMcpSearch(apiKey, query, config.count, signal);
  }

  const json = await postJson<ZhipuApiResponse>(OFFICIAL_ZHIPU_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      search_query: query,
      search_engine: config.searchEngine,
      search_intent: false,
      count: config.count,
    },
    signal,
    label: "Zhipu Web Search API",
    hintForStatus: (status) =>
      status === 401 || status === 403
        ? "Check ZHIPU_API_KEY or zhipu.apiKey in plugin options."
        : status === 429
          ? "Zhipu Web Search API rate limit or quota exceeded."
          : undefined,
  });

  if (json.error) {
    throw new SearchError(
      `Zhipu Web Search API error: ${json.error.message ?? json.error.code ?? "Unknown error"}`,
    );
  }

  const items = json.search_result ?? [];
  const results: SearchResultItem[] = [];

  for (const item of items) {
    if (!item.link) continue;
    const published = parsePublishedTimestamp(item.publish_date);
    results.push({
      url: item.link,
      ...(item.title ? { title: item.title } : {}),
      ...(item.content ? { content: item.content } : {}),
      time: {
        ...(published !== undefined ? { published } : {}),
      },
    });
  }

  return results;
}
