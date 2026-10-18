import { AuthError, SearchError } from "./errors.js";
import { postJson } from "./http.js";
import type { PluginConfig } from "./options.js";
import { resolveEnvTemplate } from "./options.js";
import { type SearchResultItem, parsePublishedTimestamp } from "./types.js";

export const DEEPSEEK_SEARCH_URL = "https://api.deepseek.com/v1/tools/search";

type DeepSeekSearchItem = {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  date?: string | null;
};

type DeepSeekApiResponse = {
  results?: DeepSeekSearchItem[];
  error?: {
    message?: string;
    code?: string;
  };
};

export type DeepSeekAuthResolver = () => Promise<string | undefined>;

export async function resolveDeepSeekApiKey(
  configuredKey: string | undefined,
  fallbackResolver?: DeepSeekAuthResolver,
): Promise<string> {
  const fromConfig = resolveEnvTemplate(configuredKey);
  if (fromConfig) return fromConfig;

  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;

  if (fallbackResolver) {
    const fromIntegration = await fallbackResolver();
    if (fromIntegration) return fromIntegration;
  }

  throw new AuthError(
    "DeepSeek API key not found.",
    "Set deepseek.apiKey in plugin options, set DEEPSEEK_API_KEY, or run `/connect` to sign in to DeepSeek.",
  );
}

export async function deepseekSearch(
  apiKey: string,
  query: string,
  config: PluginConfig["deepseek"],
  signal?: AbortSignal,
): Promise<readonly SearchResultItem[]> {
  const json = await postJson<DeepSeekApiResponse>(DEEPSEEK_SEARCH_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {
      query,
      count: config.count,
      localization: config.localization,
      need_content: config.needContent,
    },
    signal,
    label: "DeepSeek Search API",
    hintForStatus: (status) =>
      status === 401
        ? "Check DEEPSEEK_API_KEY or deepseek.apiKey in plugin options."
        : status === 402
          ? "DeepSeek account balance is insufficient. Top up before retrying."
          : status === 429
            ? "DeepSeek Search API rate limit exceeded."
            : undefined,
  });

  if (json.error) {
    throw new SearchError(
      `DeepSeek Search API error: ${json.error.message ?? json.error.code ?? "Unknown error"}`,
    );
  }

  const results: SearchResultItem[] = [];
  for (const item of json.results ?? []) {
    if (!item.url) continue;
    const published = parsePublishedTimestamp(item.date ?? undefined);
    const content = item.content || item.summary || item.snippet;
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
